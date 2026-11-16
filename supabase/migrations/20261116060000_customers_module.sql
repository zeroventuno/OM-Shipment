-- ============================================================================
-- Módulo Clienti
--
-- Envios, assistências e garantias guardam o NOME do cliente (texto digitado),
-- não o id. Para ligar cada cliente ao que ele já teve, comparamos o nome sem
-- acentos, pontuação, espaços e maiúsculas ("Officine Mattio S.r.l." =
-- "OFFICINE MATTIO SRL"). Nenhum registro existente é alterado.
--
-- 1. name_key(): a chave de comparação (mesma regra do importador).
-- 2. Índices por chave nas quatro tabelas.
-- 3. customer_overview: lista de clientes com os totais (para a tela e filtros).
-- 4. customer_activity(): tudo o que um cliente teve (para a ficha).
-- 5. import_customers(): grava uma importação numa transação só.
--
-- Tudo roda com as permissões de quem chama (RLS): só usuários logados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.name_key(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    SELECT regexp_replace(
        translate(replace(lower(coalesce(value, '')), 'ß', 'ss'),
                  'àáâãäåāăąèéêëēėęěìíîïīįòóôõöøōőùúûüūůűųçćčñńňýÿžźżšśłđ',
                  'aaaaaaaaaeeeeeeeeiiiiiioooooooouuuuuuuucccnnnyyzzzssld'),
        '[^a-z0-9]', '', 'g');
$$;

COMMENT ON FUNCTION public.name_key(TEXT) IS 'Chave para comparar nomes de clientes: sem acento, pontuação, espaço nem maiúscula.';

CREATE INDEX IF NOT EXISTS customers_name_key_idx  ON public.customers  (public.name_key(name));
CREATE INDEX IF NOT EXISTS shipments_name_key_idx  ON public.shipments  (public.name_key(customer_name));
CREATE INDEX IF NOT EXISTS tickets_name_key_idx    ON public.tickets    (public.name_key(client_name));
CREATE INDEX IF NOT EXISTS warranties_name_key_idx ON public.warranties (public.name_key(customer_name));

-- ---------------------------------------------------------------------------
-- 3. Lista com totais
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.customer_overview
WITH (security_invoker = true) AS
SELECT
    c.*,
    COALESCE(a.addresses, 0)        AS addresses,
    COALESCE(s.shipments, 0)        AS shipments,
    s.first_shipment,
    s.last_shipment,
    COALESCE(s.freight_cost, 0)     AS freight_cost,
    COALESCE(t.tickets, 0)          AS tickets,
    COALESCE(w.warranties, 0)       AS warranties,
    COALESCE(r.requests, 0)         AS requests
FROM public.customers c
LEFT JOIN LATERAL (
    SELECT count(*)::int AS addresses FROM public.customer_addresses x WHERE x.customer_id = c.id
) a ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS shipments,
           min(x.created_at) AS first_shipment,
           max(x.created_at) AS last_shipment,
           round(sum((x.selected_quote->>'price')::numeric), 2) AS freight_cost
    FROM public.shipments x WHERE public.name_key(x.customer_name) = public.name_key(c.name)
) s ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS tickets FROM public.tickets x WHERE public.name_key(x.client_name) = public.name_key(c.name)
) t ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS warranties FROM public.warranties x WHERE public.name_key(x.customer_name) = public.name_key(c.name)
) w ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS requests FROM public.shipment_requests x WHERE x.customer_id = c.id
) r ON true;

COMMENT ON VIEW public.customer_overview IS 'Clientes com totais de envios, assistências, garantias e pedidos (ligados pelo nome).';
REVOKE ALL ON public.customer_overview FROM anon;
GRANT SELECT ON public.customer_overview TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ficha: tudo o que o cliente teve
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.customer_activity(c_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH c AS (SELECT id, name_key(name) AS k FROM customers WHERE id = c_id)
    SELECT jsonb_build_object(
        'shipments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', s.id, 'created_at', s.created_at, 'order_id', s.order_id, 'order_type', s.order_type,
                'status', s.status, 'destination_country', s.destination_country,
                'portal', s.selected_quote->>'portal', 'carrier', s.selected_quote->>'carrier',
                'cost', (s.selected_quote->>'price')::numeric, 'customer_payment', s.customer_payment,
                'tracking_code', s.tracking_code, 'service_level', s.service_level,
                'ticket_id', s.ticket_id, 'warranty_id', s.warranty_id
            ) ORDER BY s.created_at DESC)
            FROM shipments s, c WHERE name_key(s.customer_name) = c.k), '[]'::jsonb),
        'tickets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'created_at', t.created_at, 'component', t.component, 'brand', t.brand,
                'phase', t.phase, 'approval_status', t.approval_status, 'completion_date', t.completion_date
            ) ORDER BY t.created_at DESC)
            FROM tickets t, c WHERE name_key(t.client_name) = c.k), '[]'::jsonb),
        'warranties', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', w.id, 'created_at', w.created_at, 'protocol_number', w.protocol_number,
                'status', w.status, 'process_type', w.process_type, 'bike_model', w.bike_model,
                'size', w.size, 'solution', w.solution, 'value', w.value, 'order_number', w.order_number
            ) ORDER BY w.created_at DESC)
            FROM warranties w, c WHERE name_key(w.customer_name) = c.k), '[]'::jsonb),
        'requests', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'created_at', r.created_at, 'status', r.status, 'service_level', r.service_level,
                'invoice_value', r.invoice_value, 'insured_value', r.insured_value,
                'requested_by', r.requested_by, 'shipment_id', r.shipment_id
            ) ORDER BY r.created_at DESC)
            FROM shipment_requests r WHERE r.customer_id = c_id), '[]'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.customer_activity(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_activity(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Importação (plano calculado no navegador, gravado aqui de uma vez)
--
-- plan = {
--   "source": "csv:dhl",
--   "customers": [{ "key": "...", "name": "...", "address_line1": ..., ... }],
--   "updates":   [{ "id": "<uuid>", "patch": { "contact_name": "...", ... } }],
--   "addresses": [{ "customer_id": "<uuid>" | null, "customer_key": "..." | null, ... , "is_default": bool }]
-- }
-- Atualizações só preenchem campos vazios: nada existente é sobrescrito.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_customers(plan JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    src     TEXT := left(COALESCE(NULLIF(trim(plan->>'source'), ''), 'import'), 40);
    ids     JSONB := '{}'::jsonb;
    item    JSONB;
    new_id  UUID;
    n_new   INT := 0;
    n_upd   INT := 0;
    n_addr  INT := 0;
    target  UUID;
    has_default BOOLEAN;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'customers', '[]'::jsonb)) LOOP
        INSERT INTO customers (name, address_line1, address_line2, address_line3, postal_code, city, region, country,
                               contact_name, phone, email, tax_id, source)
        VALUES (trim(item->>'name'), item->>'address_line1', item->>'address_line2', item->>'address_line3',
                item->>'postal_code', item->>'city', item->>'region', item->>'country',
                item->>'contact_name', item->>'phone', item->>'email', item->>'tax_id', src)
        RETURNING id INTO new_id;
        ids := ids || jsonb_build_object(item->>'key', new_id);
        n_new := n_new + 1;
    END LOOP;

    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'updates', '[]'::jsonb)) LOOP
        UPDATE customers c SET
            address_line1 = CASE WHEN NULLIF(c.address_line1, '') IS NULL THEN COALESCE(item->'patch'->>'address_line1', c.address_line1) ELSE c.address_line1 END,
            address_line2 = CASE WHEN NULLIF(c.address_line1, '') IS NULL THEN COALESCE(item->'patch'->>'address_line2', c.address_line2) ELSE c.address_line2 END,
            address_line3 = CASE WHEN NULLIF(c.address_line1, '') IS NULL THEN COALESCE(item->'patch'->>'address_line3', c.address_line3) ELSE c.address_line3 END,
            postal_code   = CASE WHEN NULLIF(c.address_line1, '') IS NULL THEN COALESCE(item->'patch'->>'postal_code', c.postal_code) ELSE c.postal_code END,
            city          = CASE WHEN NULLIF(c.address_line1, '') IS NULL THEN COALESCE(item->'patch'->>'city', c.city) ELSE c.city END,
            region        = CASE WHEN NULLIF(c.address_line1, '') IS NULL THEN COALESCE(item->'patch'->>'region', c.region) ELSE c.region END,
            country       = COALESCE(NULLIF(c.country, ''), item->'patch'->>'country'),
            contact_name  = COALESCE(NULLIF(c.contact_name, ''), item->'patch'->>'contact_name'),
            phone         = COALESCE(NULLIF(c.phone, ''), item->'patch'->>'phone'),
            email         = COALESCE(NULLIF(c.email, ''), item->'patch'->>'email'),
            tax_id        = COALESCE(NULLIF(c.tax_id, ''), item->'patch'->>'tax_id')
        WHERE c.id = (item->>'id')::UUID;
        IF FOUND THEN n_upd := n_upd + 1; END IF;
    END LOOP;

    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'addresses', '[]'::jsonb)) LOOP
        target := COALESCE(NULLIF(item->>'customer_id', '')::UUID, (ids->>(item->>'customer_key'))::UUID);
        CONTINUE WHEN target IS NULL;
        SELECT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = target AND is_default) INTO has_default;
        INSERT INTO customer_addresses (customer_id, address_line1, address_line2, address_line3, postal_code,
                                        city, region, country, contact_name, phone, is_default)
        VALUES (target, item->>'address_line1', item->>'address_line2', item->>'address_line3', item->>'postal_code',
                item->>'city', item->>'region', item->>'country', item->>'contact_name', item->>'phone',
                COALESCE((item->>'is_default')::BOOLEAN, false) AND NOT has_default);
        n_addr := n_addr + 1;
    END LOOP;

    RETURN jsonb_build_object('customers', n_new, 'updated', n_upd, 'addresses', n_addr);
END;
$$;

REVOKE ALL ON FUNCTION public.import_customers(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_customers(JSONB) TO authenticated;

-- ============================================================================
-- Unir clientes duplicados
--
-- 1. customer_aliases: outros nomes do mesmo cliente. Envios, assistências e
--    garantias continuam ligados pelo nome; depois de unir dois cadastros, o
--    nome do que saiu vira apelido do que ficou, e o histórico dele continua
--    aparecendo na ficha (sem mexer nos envios antigos).
-- 2. customer_duplicate_dismissals: pares marcados como "não são duplicados",
--    para não voltarem à lista de revisão.
-- 3. customer_overview e customer_activity passam a considerar os apelidos.
-- 4. merge_customers(): une tudo numa transação.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_aliases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_aliases_unique_idx ON public.customer_aliases (customer_id, public.name_key(name));
CREATE INDEX IF NOT EXISTS customer_aliases_key_idx ON public.customer_aliases (public.name_key(name));
COMMENT ON TABLE public.customer_aliases IS 'Outros nomes do mesmo cliente (cadastros unidos): o histórico com esses nomes aparece na ficha.';

ALTER TABLE public.customer_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_aliases_authenticated_full_access" ON public.customer_aliases;
CREATE POLICY "customer_aliases_authenticated_full_access" ON public.customer_aliases
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.customer_aliases FROM anon;

CREATE TABLE IF NOT EXISTS public.customer_duplicate_dismissals (
    customer_a UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_b UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_a, customer_b),
    CHECK (customer_a < customer_b)
);
COMMENT ON TABLE public.customer_duplicate_dismissals IS 'Pares de clientes marcados como "não são duplicados" na revisão.';

ALTER TABLE public.customer_duplicate_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_dismissals_authenticated_full_access" ON public.customer_duplicate_dismissals;
CREATE POLICY "customer_dismissals_authenticated_full_access" ON public.customer_duplicate_dismissals
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.customer_duplicate_dismissals FROM anon;

-- Chaves de nome de um cliente: o nome dele e os apelidos.
CREATE OR REPLACE FUNCTION public.customer_name_keys(c_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT array_agg(DISTINCT k) FROM (
        SELECT name_key(name) AS k FROM customers WHERE id = c_id
        UNION ALL
        SELECT name_key(name) FROM customer_aliases WHERE customer_id = c_id
    ) z WHERE k <> '';
$$;

-- ---------------------------------------------------------------------------
-- Lista com totais (agora pelo nome e pelos apelidos)
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
CROSS JOIN LATERAL (SELECT public.customer_name_keys(c.id) AS keys) k
LEFT JOIN LATERAL (
    SELECT count(*)::int AS addresses FROM public.customer_addresses x WHERE x.customer_id = c.id
) a ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS shipments,
           min(x.created_at) AS first_shipment,
           max(x.created_at) AS last_shipment,
           round(sum((x.selected_quote->>'price')::numeric), 2) AS freight_cost
    FROM public.shipments x WHERE public.name_key(x.customer_name) = ANY (k.keys)
) s ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS tickets FROM public.tickets x WHERE public.name_key(x.client_name) = ANY (k.keys)
) t ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS warranties FROM public.warranties x WHERE public.name_key(x.customer_name) = ANY (k.keys)
) w ON true
LEFT JOIN LATERAL (
    SELECT count(*)::int AS requests FROM public.shipment_requests x WHERE x.customer_id = c.id
) r ON true;

COMMENT ON VIEW public.customer_overview IS 'Clientes com totais de envios, assistências, garantias e pedidos (ligados pelo nome ou apelido).';
REVOKE ALL ON public.customer_overview FROM anon;
GRANT SELECT ON public.customer_overview TO authenticated;

-- ---------------------------------------------------------------------------
-- Ficha: tudo o que o cliente teve (nome e apelidos)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.customer_activity(c_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH c AS (SELECT customer_name_keys(c_id) AS keys)
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
            FROM shipments s, c WHERE name_key(s.customer_name) = ANY (c.keys)), '[]'::jsonb),
        'tickets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'created_at', t.created_at, 'component', t.component, 'brand', t.brand,
                'phase', t.phase, 'approval_status', t.approval_status, 'completion_date', t.completion_date
            ) ORDER BY t.created_at DESC)
            FROM tickets t, c WHERE name_key(t.client_name) = ANY (c.keys)), '[]'::jsonb),
        'warranties', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', w.id, 'created_at', w.created_at, 'protocol_number', w.protocol_number,
                'status', w.status, 'process_type', w.process_type, 'bike_model', w.bike_model,
                'size', w.size, 'solution', w.solution, 'value', w.value, 'order_number', w.order_number
            ) ORDER BY w.created_at DESC)
            FROM warranties w, c WHERE name_key(w.customer_name) = ANY (c.keys)), '[]'::jsonb),
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
-- Unir cadastros
--
-- O principal (main_id) fica. Dos outros, na ordem dada:
--   - campos vazios do principal são preenchidos (o endereço vem em bloco);
--   - notas diferentes são juntadas;
--   - endereços de entrega passam para o principal (repetidos saem);
--   - pedidos de envio passam para o principal;
--   - o nome e os apelidos viram apelidos do principal;
--   - o cadastro é apagado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_customers(main_id UUID, other_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    main      customers%ROWTYPE;
    o         customers%ROWTYPE;
    others    UUID[];
    n_addr    INT;
    n_req     INT;
    n_dup     INT;
BEGIN
    others := ARRAY(SELECT DISTINCT x FROM unnest(other_ids) x WHERE x IS NOT NULL AND x <> main_id);
    IF array_length(others, 1) IS NULL THEN
        RAISE EXCEPTION 'Nenhum cadastro para unir';
    END IF;
    SELECT * INTO main FROM customers WHERE id = main_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente principal não encontrado'; END IF;
    IF (SELECT count(*) FROM customers WHERE id = ANY (others)) <> array_length(others, 1) THEN
        RAISE EXCEPTION 'Algum cadastro para unir não existe mais';
    END IF;

    FOR o IN SELECT c.* FROM unnest(others) WITH ORDINALITY u(id, pos) JOIN customers c ON c.id = u.id ORDER BY u.pos LOOP
        IF NULLIF(trim(main.address_line1), '') IS NULL AND NULLIF(trim(o.address_line1), '') IS NOT NULL THEN
            main.address_line1 := o.address_line1; main.address_line2 := o.address_line2; main.address_line3 := o.address_line3;
            main.postal_code := o.postal_code; main.city := o.city; main.region := o.region;
            main.country := COALESCE(NULLIF(main.country, ''), o.country);
        END IF;
        main.country      := COALESCE(NULLIF(trim(main.country), ''), o.country);
        main.contact_name := COALESCE(NULLIF(trim(main.contact_name), ''), o.contact_name);
        main.phone        := COALESCE(NULLIF(trim(main.phone), ''), o.phone);
        main.email        := COALESCE(NULLIF(trim(main.email), ''), o.email);
        main.tax_id       := COALESCE(NULLIF(trim(main.tax_id), ''), o.tax_id);
        IF NULLIF(trim(o.notes), '') IS NOT NULL AND position(trim(o.notes) IN COALESCE(main.notes, '')) = 0 THEN
            main.notes := concat_ws(E'\n', NULLIF(trim(main.notes), ''), trim(o.notes));
        END IF;
    END LOOP;

    UPDATE customers SET
        address_line1 = main.address_line1, address_line2 = main.address_line2, address_line3 = main.address_line3,
        postal_code = main.postal_code, city = main.city, region = main.region, country = main.country,
        contact_name = main.contact_name, phone = main.phone, email = main.email, tax_id = main.tax_id, notes = main.notes
    WHERE id = main_id;

    -- Apelidos: nomes dos outros e os apelidos que eles já tinham.
    INSERT INTO customer_aliases (customer_id, name)
    SELECT DISTINCT ON (name_key(n)) main_id, n FROM (
        SELECT name AS n FROM customers WHERE id = ANY (others)
        UNION ALL
        SELECT name FROM customer_aliases WHERE customer_id = ANY (others)
    ) z
    WHERE name_key(n) <> name_key(main.name)
    ON CONFLICT DO NOTHING;

    -- Endereços de entrega
    UPDATE customer_addresses SET customer_id = main_id, is_default = false WHERE customer_id = ANY (others);
    GET DIAGNOSTICS n_addr = ROW_COUNT;
    WITH ranked AS (
        SELECT id, row_number() OVER (
            PARTITION BY name_key(address_line1), name_key(postal_code), name_key(city), name_key(country)
            ORDER BY is_default DESC, created_at
        ) AS rn
        FROM customer_addresses WHERE customer_id = main_id
    )
    DELETE FROM customer_addresses WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    GET DIAGNOSTICS n_dup = ROW_COUNT;
    IF NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = main_id AND is_default) THEN
        UPDATE customer_addresses SET is_default = true
        WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = main_id ORDER BY created_at LIMIT 1);
    END IF;

    -- Pedidos de envio
    UPDATE shipment_requests SET customer_id = main_id WHERE customer_id = ANY (others);
    GET DIAGNOSTICS n_req = ROW_COUNT;

    DELETE FROM customers WHERE id = ANY (others);

    RETURN jsonb_build_object('merged', array_length(others, 1), 'addresses_moved', n_addr - n_dup,
                              'addresses_duplicate', n_dup, 'requests', n_req);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(UUID, UUID[]) TO authenticated;
REVOKE ALL ON FUNCTION public.customer_name_keys(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_name_keys(UUID) TO authenticated;

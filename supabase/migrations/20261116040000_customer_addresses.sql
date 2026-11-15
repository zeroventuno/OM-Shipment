-- ============================================================================
-- Vários endereços de entrega por cliente
--
-- Modelo:
--   * customers guarda o cliente e o endereço principal (fiscal/faturação),
--     junto com o código fiscal — nada muda nas colunas que já existem;
--   * customer_addresses guarda os endereços de ENTREGA (um cliente pode ter
--     vários; um deles é o padrão);
--   * shipment_requests.address_id diz para qual endereço é o pedido.
--
-- Clientes que já têm endereço ganham esse mesmo endereço como entrega padrão.
-- O formulário aberto passa a listar os endereços de entrega do cliente
-- escolhido (sem telefone/e-mail) e a permitir cadastrar um novo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    -- Apelido opcional: "Magazzino", "Negozio Milano"…
    label         TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    address_line3 TEXT,
    postal_code   TEXT,
    city          TEXT NOT NULL,
    region        TEXT,
    country       TEXT NOT NULL,
    contact_name  TEXT,
    phone         TEXT,
    is_default    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx ON public.customer_addresses (customer_id);
-- No máximo um endereço padrão por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default
    ON public.customer_addresses (customer_id) WHERE is_default;

COMMENT ON TABLE public.customer_addresses IS 'Endereços de entrega dos clientes (vários por cliente, um padrão).';

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_addresses_authenticated_full_access" ON public.customer_addresses;
CREATE POLICY "customer_addresses_authenticated_full_access" ON public.customer_addresses
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.customer_addresses FROM anon;

DROP TRIGGER IF EXISTS customer_addresses_touch ON public.customer_addresses;
CREATE TRIGGER customer_addresses_touch BEFORE UPDATE ON public.customer_addresses
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Endereço que o cliente já tinha vira o endereço de entrega padrão.
INSERT INTO public.customer_addresses
    (customer_id, address_line1, address_line2, address_line3, postal_code, city, region, country, contact_name, phone, is_default)
SELECT c.id, c.address_line1, c.address_line2, c.address_line3, c.postal_code, c.city, c.region, c.country, c.contact_name, c.phone, true
FROM public.customers c
WHERE c.address_line1 IS NOT NULL AND c.city IS NOT NULL AND c.country IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.customer_addresses a WHERE a.customer_id = c.id);

ALTER TABLE public.shipment_requests
    ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES public.customer_addresses(id) ON DELETE SET NULL;

-- Pedidos já feitos: usam o endereço padrão do cliente.
UPDATE public.shipment_requests r SET address_id = a.id
FROM public.customer_addresses a
WHERE r.address_id IS NULL AND a.customer_id = r.customer_id AND a.is_default;

-- ---------------------------------------------------------------------------
-- Funções do formulário aberto
-- ---------------------------------------------------------------------------

-- Grava um endereço de entrega a partir do JSON do formulário (uso interno).
CREATE OR REPLACE FUNCTION public.request_form_insert_address(c_id UUID, address JSONB, make_default BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    a_id UUID;
BEGIN
    IF request_form_clean(address->>'address_line1', 300) IS NULL
       OR request_form_clean(address->>'city', 120) IS NULL
       OR request_form_clean(address->>'country', 80) IS NULL THEN
        RAISE EXCEPTION 'address, city and country are required' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM customer_addresses WHERE customer_id = c_id) >= 30 THEN
        RAISE EXCEPTION 'too many addresses for this customer' USING ERRCODE = '53400';
    END IF;
    IF make_default THEN
        UPDATE customer_addresses SET is_default = false WHERE customer_id = c_id AND is_default;
    END IF;
    INSERT INTO customer_addresses (customer_id, label, address_line1, address_line2, address_line3,
                                    postal_code, city, region, country, contact_name, phone, is_default)
    VALUES (
        c_id,
        request_form_clean(address->>'label', 80),
        request_form_clean(address->>'address_line1', 300),
        request_form_clean(address->>'address_line2', 300),
        request_form_clean(address->>'address_line3', 300),
        request_form_clean(address->>'postal_code', 20),
        request_form_clean(address->>'city', 120),
        request_form_clean(address->>'region', 120),
        request_form_clean(address->>'country', 80),
        request_form_clean(address->>'contact_name', 200),
        request_form_clean(address->>'phone', 60),
        make_default OR NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = c_id))
    RETURNING id INTO a_id;
    RETURN a_id;
END;
$$;

-- Cadastro de cliente: igual ao anterior, e o endereço vira também o
-- endereço de entrega padrão.
CREATE OR REPLACE FUNCTION public.request_form_create_customer(token TEXT, customer JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_name  TEXT := request_form_clean(customer->>'name', 200);
    c_id    UUID;
    a_id    UUID;
    existed BOOLEAN := false;
    had_address BOOLEAN := false;
BEGIN
    PERFORM request_form_auth(token);
    IF c_name IS NULL THEN
        RAISE EXCEPTION 'customer name is required' USING ERRCODE = '22023';
    END IF;
    IF request_form_clean(customer->>'address_line1', 300) IS NULL
       OR request_form_clean(customer->>'city', 120) IS NULL
       OR request_form_clean(customer->>'country', 80) IS NULL THEN
        RAISE EXCEPTION 'address, city and country are required' USING ERRCODE = '22023';
    END IF;

    SELECT id, address_line1 IS NOT NULL INTO c_id, had_address FROM customers WHERE lower(trim(name)) = lower(c_name);
    IF c_id IS NOT NULL THEN
        existed := true;
        UPDATE customers SET
            address_line1 = request_form_clean(customer->>'address_line1', 300),
            address_line2 = request_form_clean(customer->>'address_line2', 300),
            address_line3 = request_form_clean(customer->>'address_line3', 300),
            postal_code   = request_form_clean(customer->>'postal_code', 20),
            city          = request_form_clean(customer->>'city', 120),
            region        = request_form_clean(customer->>'region', 120),
            country       = request_form_clean(customer->>'country', 80),
            contact_name  = COALESCE(request_form_clean(customer->>'contact_name', 200), contact_name),
            phone         = COALESCE(request_form_clean(customer->>'phone', 60), phone),
            email         = COALESCE(request_form_clean(customer->>'email', 200), email),
            tax_id        = COALESCE(request_form_clean(customer->>'tax_id', 60), tax_id)
        WHERE id = c_id AND address_line1 IS NULL;
    ELSE
        INSERT INTO customers (name, address_line1, address_line2, address_line3, postal_code, city, region, country,
                               contact_name, phone, email, tax_id, source)
        VALUES (
            c_name,
            request_form_clean(customer->>'address_line1', 300),
            request_form_clean(customer->>'address_line2', 300),
            request_form_clean(customer->>'address_line3', 300),
            request_form_clean(customer->>'postal_code', 20),
            request_form_clean(customer->>'city', 120),
            request_form_clean(customer->>'region', 120),
            request_form_clean(customer->>'country', 80),
            request_form_clean(customer->>'contact_name', 200),
            request_form_clean(customer->>'phone', 60),
            request_form_clean(customer->>'email', 200),
            request_form_clean(customer->>'tax_id', 60),
            'request_form')
        RETURNING id INTO c_id;
    END IF;

    -- Cliente sem endereço de entrega ganha este como padrão.
    IF NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = c_id) THEN
        a_id := request_form_insert_address(c_id, customer, true);
    END IF;
    RETURN jsonb_build_object('id', c_id, 'name', c_name, 'existed', existed, 'address_id', a_id);
END;
$$;

-- Endereços de entrega do cliente escolhido (sem telefone).
CREATE OR REPLACE FUNCTION public.request_form_customer_addresses(token TEXT, customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM request_form_auth(token);
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', a.id, 'label', a.label, 'address_line1', a.address_line1, 'address_line2', a.address_line2,
            'address_line3', a.address_line3, 'postal_code', a.postal_code, 'city', a.city, 'region', a.region,
            'country', a.country, 'contact_name', a.contact_name, 'is_default', a.is_default)
            ORDER BY a.is_default DESC, a.created_at)
        FROM customer_addresses a WHERE a.customer_id = request_form_customer_addresses.customer_id
    ), '[]'::jsonb);
END;
$$;

-- Novo endereço de entrega para um cliente existente.
CREATE OR REPLACE FUNCTION public.request_form_add_address(token TEXT, customer_id UUID, address JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    a_id UUID;
BEGIN
    PERFORM request_form_auth(token);
    IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = request_form_add_address.customer_id) THEN
        RAISE EXCEPTION 'customer not found' USING ERRCODE = '22023';
    END IF;
    a_id := request_form_insert_address(customer_id, address, false);
    RETURN jsonb_build_object('id', a_id);
END;
$$;

-- Pedido de envio: agora com o endereço de entrega.
CREATE OR REPLACE FUNCTION public.request_form_submit(token TEXT, request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l      request_links;
    boxes  JSONB := request->'boxes';
    box    JSONB;
    clean  JSONB := '[]'::jsonb;
    w NUMERIC; h NUMERIC; d NUMERIC; kg NUMERIC;
    r_id   UUID;
    c_id   UUID;
    a_id   UUID;
    recent INTEGER;
BEGIN
    l := request_form_auth(token);

    SELECT count(*) INTO recent FROM shipment_requests
     WHERE link_id = l.id AND created_at > now() - interval '1 hour';
    IF recent >= 30 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    c_id := (request->>'customer_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = c_id) THEN
        RAISE EXCEPTION 'customer not found' USING ERRCODE = '22023';
    END IF;

    -- Endereço: o escolhido (precisa ser do cliente) ou o padrão do cliente.
    a_id := NULLIF(request->>'address_id', '')::UUID;
    IF a_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer_addresses WHERE id = a_id AND customer_id = c_id) THEN
        RAISE EXCEPTION 'address does not belong to the customer' USING ERRCODE = '22023';
    END IF;
    IF a_id IS NULL THEN
        SELECT id INTO a_id FROM customer_addresses WHERE customer_id = c_id ORDER BY is_default DESC, created_at LIMIT 1;
    END IF;
    IF a_id IS NULL THEN
        RAISE EXCEPTION 'customer has no shipping address' USING ERRCODE = '22023';
    END IF;

    IF request_form_clean(request->>'requested_by', 120) IS NULL THEN
        RAISE EXCEPTION 'requested_by is required' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(boxes) <> 'array' OR jsonb_array_length(boxes) NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'between 1 and 20 boxes' USING ERRCODE = '22023';
    END IF;
    FOR box IN SELECT * FROM jsonb_array_elements(boxes) LOOP
        w := (box->>'width')::NUMERIC; h := (box->>'height')::NUMERIC;
        d := (box->>'depth')::NUMERIC; kg := (box->>'weight')::NUMERIC;
        IF w IS NULL OR h IS NULL OR d IS NULL OR kg IS NULL
           OR w NOT BETWEEN 1 AND 400 OR h NOT BETWEEN 1 AND 400 OR d NOT BETWEEN 1 AND 400
           OR kg NOT BETWEEN 0.1 AND 2000 THEN
            RAISE EXCEPTION 'invalid box size or weight' USING ERRCODE = '22023';
        END IF;
        clean := clean || jsonb_build_object('width', w, 'height', h, 'depth', d, 'weight', kg);
    END LOOP;

    INSERT INTO shipment_requests (customer_id, address_id, boxes, service_level, order_ref, notes, requested_by, link_id)
    VALUES (
        c_id, a_id, clean,
        CASE WHEN request->>'service_level' = 'express' THEN 'express' ELSE 'standard' END,
        request_form_clean(request->>'order_ref', 80),
        request_form_clean(request->>'notes', 2000),
        request_form_clean(request->>'requested_by', 120),
        l.id)
    RETURNING id INTO r_id;
    RETURN jsonb_build_object('id', r_id);
EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;

-- Lista do link: agora mostra a cidade/país do endereço de entrega.
CREATE OR REPLACE FUNCTION public.request_form_list(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l request_links;
BEGIN
    l := request_form_auth(token);
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', r.id,
            'created_at', r.created_at,
            'customer', c.name,
            'country', COALESCE(a.country, c.country),
            'city', COALESCE(a.city, c.city),
            'boxes', r.boxes,
            'service_level', r.service_level,
            'order_ref', r.order_ref,
            'requested_by', r.requested_by,
            'status', r.status,
            'carrier', NULLIF(trim(concat_ws(' / ', s.selected_quote->>'portal', s.selected_quote->>'carrier')), ''),
            'tracking_code', NULLIF(s.tracking_code, '')
        ) ORDER BY r.created_at DESC)
        FROM shipment_requests r
        JOIN customers c ON c.id = r.customer_id
        LEFT JOIN customer_addresses a ON a.id = r.address_id
        LEFT JOIN shipments s ON s.id = r.shipment_id
        WHERE r.link_id = l.id AND r.created_at > now() - interval '60 days'
    ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.request_form_insert_address(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_form_customer_addresses(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_form_add_address(TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_form_customer_addresses(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_form_add_address(TEXT, UUID, JSONB) TO anon, authenticated;

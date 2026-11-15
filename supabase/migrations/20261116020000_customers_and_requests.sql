-- ============================================================================
-- Clientes e pedidos de envio
--
-- 1. customers: cadastro único de clientes (o mais importante: endereço de
--    entrega). Começa com os nomes que já existem nos envios; a importação
--    dos CSV dos portais vai completar endereços depois.
-- 2. shipment_requests: pedidos de envio feitos pela equipe da oficina por um
--    link aberto (sem login), com as caixas (medidas e peso) e o serviço.
-- 3. request_links: os links do formulário. Cada link tem um token secreto
--    (só o hash fica aqui); quem tem o link consegue pedir envios e ver a lista
--    de nomes de clientes. Um link pode ser desativado a qualquer momento.
-- 4. shipments ganha request_id e parcels; salvar um envio a partir de um
--    pedido marca o pedido como enviado (trigger).
-- 5. Funções request_form_* que o formulário público chama. Elas conferem o
--    token, validam os dados e expõem só o mínimo (nome, cidade, país).
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clientes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    address_line1 TEXT,
    address_line2 TEXT,
    address_line3 TEXT,
    postal_code   TEXT,
    city          TEXT,
    region        TEXT,
    -- Mesmo valor usado em shipments.destination_country (nome do país)
    country       TEXT,
    contact_name  TEXT,
    phone         TEXT,
    email         TEXT,
    -- Código fiscal / partita IVA / VAT / EORI: importação e faturação
    tax_id        TEXT,
    notes         TEXT,
    -- De onde veio o cadastro: shipments, request_form, app, csv:<portal>
    source        TEXT NOT NULL DEFAULT 'app',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_name_unique ON public.customers (lower(trim(name)));
COMMENT ON TABLE public.customers IS 'Cadastro único de clientes da Officine Mattio (endereço de entrega).';

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_authenticated_full_access" ON public.customers;
CREATE POLICY "customers_authenticated_full_access" ON public.customers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.customers FROM anon;

DROP TRIGGER IF EXISTS customers_touch ON public.customers;
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Clientes que já aparecem nos envios, com o país do envio mais recente.
INSERT INTO public.customers (name, country, source)
SELECT DISTINCT ON (lower(trim(customer_name))) trim(customer_name), destination_country, 'shipments'
FROM public.shipments
WHERE customer_name IS NOT NULL AND trim(customer_name) <> ''
ORDER BY lower(trim(customer_name)), created_at DESC
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Pedidos de envio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipment_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   UUID NOT NULL REFERENCES public.customers(id),
    -- [{ "width": 120, "height": 80, "depth": 30, "weight": 18.5 }] em cm e kg
    boxes         JSONB NOT NULL,
    service_level TEXT NOT NULL DEFAULT 'standard' CHECK (service_level IN ('standard', 'express')),
    order_ref     TEXT,
    notes         TEXT,
    requested_by  TEXT NOT NULL,
    link_id       UUID,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'cancelled')),
    shipment_id   UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipment_requests_status_idx ON public.shipment_requests (status, created_at DESC);
COMMENT ON TABLE public.shipment_requests IS 'Pedidos de envio feitos pela equipe pelo formulário aberto.';

ALTER TABLE public.shipment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipment_requests_authenticated_full_access" ON public.shipment_requests;
CREATE POLICY "shipment_requests_authenticated_full_access" ON public.shipment_requests
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.shipment_requests FROM anon;

DROP TRIGGER IF EXISTS shipment_requests_touch ON public.shipment_requests;
CREATE TRIGGER shipment_requests_touch BEFORE UPDATE ON public.shipment_requests
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Links do formulário
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.request_links (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.request_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_links FROM anon, authenticated;

ALTER TABLE public.shipment_requests DROP CONSTRAINT IF EXISTS shipment_requests_link_fk;
ALTER TABLE public.shipment_requests
    ADD CONSTRAINT shipment_requests_link_fk FOREIGN KEY (link_id) REFERENCES public.request_links(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Envio criado a partir de um pedido
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.shipment_requests(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS parcels    JSONB;

COMMENT ON COLUMN public.shipments.parcels IS 'Caixas do envio: [{width, height, depth, weight}] em cm e kg.';

CREATE OR REPLACE FUNCTION public.sync_shipment_to_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.request_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.request_id IS DISTINCT FROM OLD.request_id) THEN
        UPDATE shipment_requests
           SET status = 'shipped', shipment_id = NEW.id
         WHERE id = NEW.request_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_sync_request ON public.shipments;
CREATE TRIGGER shipments_sync_request
    AFTER INSERT OR UPDATE ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION public.sync_shipment_to_request();

-- ---------------------------------------------------------------------------
-- 5. Funções do formulário público
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_form_auth(token TEXT)
RETURNS public.request_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    l public.request_links;
BEGIN
    SELECT * INTO l FROM public.request_links
     WHERE token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid or disabled link' USING ERRCODE = '28000';
    END IF;
    RETURN l;
END;
$$;

-- Nome do link (para o cabeçalho do formulário) e se ele vale.
CREATE OR REPLACE FUNCTION public.request_form_info(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l request_links;
BEGIN
    l := request_form_auth(token);
    RETURN jsonb_build_object('name', l.name);
END;
$$;

-- Lista de clientes para escolher: só nome, cidade e país.
CREATE OR REPLACE FUNCTION public.request_form_customers(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM request_form_auth(token);
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'country', c.country)
                         ORDER BY lower(c.name))
        FROM customers c
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_form_clean(value TEXT, max_len INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(left(trim(value), max_len), '');
$$;

-- Cadastra um cliente novo (ou devolve o existente com o mesmo nome).
CREATE OR REPLACE FUNCTION public.request_form_create_customer(token TEXT, customer JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_name TEXT := request_form_clean(customer->>'name', 200);
    c_id   UUID;
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

    SELECT id INTO c_id FROM customers WHERE lower(trim(name)) = lower(c_name);
    IF c_id IS NULL THEN
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
    RETURN jsonb_build_object('id', c_id, 'name', c_name);
END;
$$;

-- Envia um pedido de envio.
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
    recent INTEGER;
BEGIN
    l := request_form_auth(token);

    -- Freio contra abuso do link aberto.
    SELECT count(*) INTO recent FROM shipment_requests
     WHERE link_id = l.id AND created_at > now() - interval '1 hour';
    IF recent >= 30 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = (request->>'customer_id')::UUID) THEN
        RAISE EXCEPTION 'customer not found' USING ERRCODE = '22023';
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

    INSERT INTO shipment_requests (customer_id, boxes, service_level, order_ref, notes, requested_by, link_id)
    VALUES (
        (request->>'customer_id')::UUID,
        clean,
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

-- Pedidos dos últimos 60 dias deste link, com o andamento.
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
            'country', c.country,
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
        LEFT JOIN shipments s ON s.id = r.shipment_id
        WHERE r.link_id = l.id AND r.created_at > now() - interval '60 days'
    ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.request_form_auth(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_form_clean(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_shipment_to_request() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.request_form_info(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_form_customers(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_form_create_customer(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_form_submit(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_form_list(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_form_info(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_form_customers(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_form_create_customer(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_form_submit(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_form_list(TEXT) TO anon, authenticated;

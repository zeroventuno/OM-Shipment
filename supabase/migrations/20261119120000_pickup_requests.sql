-- ============================================================================
-- Pedidos de retirada de parceiros externos
--
-- Lojas e parceiros de fora da Officine Mattio (ex.: uma loja na Holanda)
-- pedem que a OM retire uma bicicleta ou caixas na loja deles: garantia,
-- reparo, devolução. O formulário fica em /ritiro/<token>.
--
-- Diferente do pedido de envio da equipe (request_form_*), quem tem este link
-- só consegue ENVIAR: não vê clientes, endereços nem outros pedidos. O pedido
-- entra numa fila (pickup_requests); a equipe confere e cria o envio de
-- retirada a partir dele (shipments.pickup_request_id).
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pickup_links (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pickup_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pickup_links FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.pickup_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT UNIQUE,
    link_id       UUID REFERENCES public.pickup_links(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'converted', 'rejected')),
    reason        TEXT NOT NULL CHECK (reason IN ('warranty', 'repair', 'return', 'other')),
    shop_name     TEXT NOT NULL,
    contact_name  TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    postal_code   TEXT NOT NULL,
    city          TEXT NOT NULL,
    country       TEXT NOT NULL,
    ready_from    DATE NOT NULL,
    opening_hours TEXT,
    reference     TEXT,
    description   TEXT NOT NULL,
    -- [{ "width": 120, "height": 35, "depth": 80, "weight": 10 }] em cm e kg (opcional)
    boxes         JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes         TEXT,
    language      TEXT,
    privacy_accepted_at TIMESTAMPTZ NOT NULL,
    shipment_id   UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_requests_status_idx ON public.pickup_requests (status, created_at DESC);
COMMENT ON TABLE public.pickup_requests IS 'Pedidos de retirada de lojas e parceiros externos; a equipe confere e cria o envio de retirada.';

ALTER TABLE public.pickup_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pickup_requests_authenticated_full_access" ON public.pickup_requests;
CREATE POLICY "pickup_requests_authenticated_full_access" ON public.pickup_requests
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.pickup_requests FROM anon;

DROP TRIGGER IF EXISTS pickup_requests_touch ON public.pickup_requests;
CREATE TRIGGER pickup_requests_touch BEFORE UPDATE ON public.pickup_requests
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Referência que a loja recebe: OMP-AA-NNN.
CREATE OR REPLACE FUNCTION public.set_pickup_request_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('pickup_requests.code'));
    SELECT COALESCE(MAX((regexp_match(code, '^OMP-\d{2}-(\d+)$'))[1]::INTEGER), 0) + 1
      INTO next_number
      FROM public.pickup_requests;
    NEW.code := 'OMP-' || to_char(now() AT TIME ZONE 'Europe/Rome', 'YY') || '-' || lpad(next_number::TEXT, 3, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pickup_requests_set_code ON public.pickup_requests;
CREATE TRIGGER pickup_requests_set_code BEFORE INSERT ON public.pickup_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_pickup_request_code();

-- ---------------------------------------------------------------------------
-- 2. Envio de retirada criado a partir do pedido
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS pickup_request_id UUID REFERENCES public.pickup_requests(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_shipment_to_pickup_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.pickup_request_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.pickup_request_id IS DISTINCT FROM OLD.pickup_request_id) THEN
        UPDATE pickup_requests
           SET status = 'converted', shipment_id = NEW.id
         WHERE id = NEW.pickup_request_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_sync_pickup_request ON public.shipments;
CREATE TRIGGER shipments_sync_pickup_request
    AFTER INSERT OR UPDATE ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION public.sync_shipment_to_pickup_request();

-- ---------------------------------------------------------------------------
-- 3. Funções do formulário público (só enviam; não devolvem dados do sistema)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pickup_form_auth(token TEXT)
RETURNS public.pickup_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    l public.pickup_links;
BEGIN
    SELECT * INTO l FROM public.pickup_links
     WHERE token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid or disabled link' USING ERRCODE = '28000';
    END IF;
    RETURN l;
END;
$$;

CREATE OR REPLACE FUNCTION public.pickup_form_check(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM pickup_form_auth(token);
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Caixas padrão da OM (nome e medidas), para a loja escolher.
CREATE OR REPLACE FUNCTION public.pickup_form_box_presets(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM pickup_form_auth(token);
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', b.id, 'name', b.name, 'width', b.width, 'height', b.height,
            'depth', b.depth, 'avg_weight', b.avg_weight) ORDER BY b.sort_order, b.name)
        FROM box_presets b WHERE b.active
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.pickup_form_submit(token TEXT, request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l        pickup_links;
    r_reason TEXT := request->>'reason';
    r_shop   TEXT := request_form_clean(request->>'shop_name', 200);
    r_name   TEXT := request_form_clean(request->>'contact_name', 200);
    r_email  TEXT := lower(request_form_clean(request->>'email', 200));
    r_phone  TEXT := request_form_clean(request->>'phone', 60);
    r_addr   TEXT := request_form_clean(request->>'address_line1', 200);
    r_zip    TEXT := request_form_clean(request->>'postal_code', 20);
    r_city   TEXT := request_form_clean(request->>'city', 120);
    r_ctry   TEXT := request_form_clean(request->>'country', 80);
    r_desc   TEXT := request_form_clean(request->>'description', 2000);
    r_from   DATE := NULLIF(trim(coalesce(request->>'ready_from', '')), '')::DATE;
    r_boxes  JSONB := '[]'::jsonb;
    b        JSONB;
    recent   INTEGER;
    r_code   TEXT;
BEGIN
    l := pickup_form_auth(token);

    -- Campo invisível: só robô preenche. Responde como se tivesse dado certo.
    IF request_form_clean(request->>'website', 200) IS NOT NULL THEN
        RETURN jsonb_build_object('code', NULL);
    END IF;

    SELECT count(*) INTO recent FROM pickup_requests
     WHERE link_id = l.id AND created_at > now() - interval '1 hour';
    IF recent >= 20 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    IF r_reason IS NULL OR r_reason NOT IN ('warranty', 'repair', 'return', 'other') THEN
        RAISE EXCEPTION 'invalid reason' USING ERRCODE = '22023';
    END IF;
    IF r_shop IS NULL OR r_name IS NULL OR r_phone IS NULL OR r_addr IS NULL OR r_zip IS NULL
       OR r_city IS NULL OR r_ctry IS NULL OR r_desc IS NULL THEN
        RAISE EXCEPTION 'required fields missing' USING ERRCODE = '22023';
    END IF;
    IF r_email IS NULL OR r_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
    END IF;
    IF r_from IS NULL OR r_from < current_date - 1 OR r_from > current_date + 180 THEN
        RAISE EXCEPTION 'invalid date' USING ERRCODE = '22023';
    END IF;
    IF coalesce(request->>'privacy_accepted', '') <> 'true' THEN
        RAISE EXCEPTION 'privacy notice must be accepted' USING ERRCODE = '22023';
    END IF;

    -- Caixas: até 20, medidas e peso positivos e com limite.
    IF jsonb_typeof(request->'boxes') = 'array' THEN
        FOR b IN SELECT value FROM jsonb_array_elements(request->'boxes') LIMIT 20 LOOP
            IF (b->>'width')::NUMERIC BETWEEN 1 AND 400 AND (b->>'height')::NUMERIC BETWEEN 1 AND 400
               AND (b->>'depth')::NUMERIC BETWEEN 1 AND 400 AND (b->>'weight')::NUMERIC BETWEEN 0.1 AND 1000 THEN
                r_boxes := r_boxes || jsonb_build_array(jsonb_build_object(
                    'width', (b->>'width')::NUMERIC, 'height', (b->>'height')::NUMERIC,
                    'depth', (b->>'depth')::NUMERIC, 'weight', (b->>'weight')::NUMERIC));
            ELSE
                RAISE EXCEPTION 'invalid box' USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END IF;

    INSERT INTO pickup_requests (
        link_id, reason, shop_name, contact_name, email, phone, address_line1, address_line2,
        postal_code, city, country, ready_from, opening_hours, reference, description, boxes,
        notes, language, privacy_accepted_at)
    VALUES (
        l.id, r_reason, r_shop, r_name, r_email, r_phone, r_addr, request_form_clean(request->>'address_line2', 200),
        r_zip, r_city, r_ctry, r_from, request_form_clean(request->>'opening_hours', 200),
        request_form_clean(request->>'reference', 120), r_desc, r_boxes,
        request_form_clean(request->>'notes', 2000), request_form_clean(request->>'language', 5), now())
    RETURNING code INTO r_code;

    RETURN jsonb_build_object('code', r_code);
EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permissões
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pickup_form_auth(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_pickup_request_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_shipment_to_pickup_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pickup_form_check(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pickup_form_box_presets(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pickup_form_submit(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pickup_form_check(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pickup_form_box_presets(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pickup_form_submit(TEXT, JSONB) TO anon, authenticated;

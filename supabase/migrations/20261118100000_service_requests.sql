-- ============================================================================
-- Pedidos públicos de garantia e assistência
--
-- Formulário aberto a clientes finais (/assistenza/<token>):
--   * garantia   = produto Officine Mattio;
--   * assistência = produto de terceiros (Shimano, SRAM, rodas...).
--
-- O pedido entra numa fila (service_requests) e só vira garantia ou assistência
-- depois que a equipe confere. Quem tem o link só consegue ENVIAR: as funções
-- abaixo não devolvem nenhum dado de clientes nem de outros pedidos.
--
-- Arquivos: bucket privado service-intake. O envio é liberado por uma "vaga"
-- (service_uploads) de curta duração, com limite de arquivos.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_links (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_links FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.service_uploads (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id    UUID NOT NULL REFERENCES public.service_links(id) ON DELETE CASCADE,
    used       BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_uploads_link_idx ON public.service_uploads (link_id, created_at DESC);
ALTER TABLE public.service_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_uploads FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.service_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT UNIQUE,
    kind          TEXT NOT NULL CHECK (kind IN ('warranty', 'assistance')),
    status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'converted', 'rejected')),
    -- Por onde o pedido chegou. Hoje só 'form'; os demais ficam para os canais futuros.
    source        TEXT NOT NULL DEFAULT 'form' CHECK (source IN ('form', 'email', 'whatsapp', 'agent')),
    link_id       UUID REFERENCES public.service_links(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT,
    country       TEXT,
    shop          TEXT,
    purchase_date DATE,
    brand         TEXT,
    product       TEXT NOT NULL,
    size          TEXT,
    serial_number TEXT,
    problem       TEXT NOT NULL,
    language      TEXT,
    -- [{ "path": "...", "folder": "photos|receipt", "mime": "...", "size": 123 }]
    files         JSONB NOT NULL DEFAULT '[]'::jsonb,
    privacy_accepted_at TIMESTAMPTZ NOT NULL,
    ticket_id     VARCHAR REFERENCES public.tickets(id) ON DELETE SET NULL,
    warranty_id   VARCHAR REFERENCES public.warranties(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_requests_status_idx ON public.service_requests (status, created_at DESC);
COMMENT ON TABLE public.service_requests IS 'Pedidos de garantia/assistência vindos de fora; a equipe confere antes de abrir o processo.';

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_requests_authenticated_full_access" ON public.service_requests;
CREATE POLICY "service_requests_authenticated_full_access" ON public.service_requests
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.service_requests FROM anon;

DROP TRIGGER IF EXISTS service_requests_touch ON public.service_requests;
CREATE TRIGGER service_requests_touch BEFORE UPDATE ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Referência que o cliente recebe: OMR-AA-NNN.
CREATE OR REPLACE FUNCTION public.set_service_request_code()
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
    PERFORM pg_advisory_xact_lock(hashtext('service_requests.code'));
    SELECT COALESCE(MAX((regexp_match(code, '^OMR-\d{2}-(\d+)$'))[1]::INTEGER), 0) + 1
      INTO next_number
      FROM public.service_requests;
    NEW.code := 'OMR-' || to_char(now() AT TIME ZONE 'Europe/Rome', 'YY') || '-' || lpad(next_number::TEXT, 3, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_requests_set_code ON public.service_requests;
CREATE TRIGGER service_requests_set_code BEFORE INSERT ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_service_request_code();

-- ---------------------------------------------------------------------------
-- 2. Funções do formulário público
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.service_form_auth(token TEXT)
RETURNS public.service_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    l public.service_links;
BEGIN
    SELECT * INTO l FROM public.service_links
     WHERE token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid or disabled link' USING ERRCODE = '28000';
    END IF;
    RETURN l;
END;
$$;

-- Só diz se o link vale: o nome interno do link não aparece para o cliente.
CREATE OR REPLACE FUNCTION public.service_form_check(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM service_form_auth(token);
    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_form_start_upload(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l      service_links;
    recent INTEGER;
    u_id   UUID;
BEGIN
    l := service_form_auth(token);
    SELECT count(*) INTO recent FROM service_uploads
     WHERE link_id = l.id AND created_at > now() - interval '1 hour';
    IF recent >= 60 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;
    INSERT INTO service_uploads (link_id) VALUES (l.id) RETURNING id INTO u_id;
    RETURN jsonb_build_object('upload_id', u_id);
END;
$$;

-- Usada pela política do bucket: <vaga>/photos/<arquivo> ou <vaga>/receipt/<arquivo>.
CREATE OR REPLACE FUNCTION public.service_upload_allowed(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    parts TEXT[] := storage.foldername(object_name);
    u_id  UUID;
BEGIN
    IF coalesce(array_length(parts, 1), 0) <> 2 OR parts[2] NOT IN ('photos', 'receipt') THEN
        RETURN false;
    END IF;
    u_id := parts[1]::UUID;
    IF NOT EXISTS (SELECT 1 FROM service_uploads u
                    WHERE u.id = u_id AND NOT u.used AND u.created_at > now() - interval '2 hours') THEN
        RETURN false;
    END IF;
    RETURN (SELECT count(*) FROM storage.objects o
             WHERE o.bucket_id = 'service-intake'
               AND o.name LIKE parts[1] || '/' || parts[2] || '/%')
           < CASE parts[2] WHEN 'photos' THEN 8 ELSE 2 END;
EXCEPTION
    WHEN invalid_text_representation THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_form_submit(token TEXT, request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l        service_links;
    r_kind   TEXT := request->>'kind';
    r_name   TEXT := request_form_clean(request->>'customer_name', 200);
    r_email  TEXT := lower(request_form_clean(request->>'email', 200));
    r_brand  TEXT := request_form_clean(request->>'brand', 120);
    r_prod   TEXT := request_form_clean(request->>'product', 200);
    r_serial TEXT := request_form_clean(request->>'serial_number', 120);
    r_prob   TEXT := request_form_clean(request->>'problem', 5000);
    r_date   DATE := NULLIF(trim(coalesce(request->>'purchase_date', '')), '')::DATE;
    u_id     UUID := NULLIF(trim(coalesce(request->>'upload_id', '')), '')::UUID;
    r_files  JSONB := '[]'::jsonb;
    recent   INTEGER;
    r_code   TEXT;
BEGIN
    l := service_form_auth(token);

    -- Campo invisível: só robô preenche. Responde como se tivesse dado certo.
    IF request_form_clean(request->>'website', 200) IS NOT NULL THEN
        RETURN jsonb_build_object('code', NULL);
    END IF;

    SELECT count(*) INTO recent FROM service_requests
     WHERE link_id = l.id AND created_at > now() - interval '1 hour';
    IF recent >= 30 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    IF r_kind IS NULL OR r_kind NOT IN ('warranty', 'assistance') THEN
        RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
    END IF;
    IF r_name IS NULL OR r_prod IS NULL OR r_prob IS NULL THEN
        RAISE EXCEPTION 'name, product and problem are required' USING ERRCODE = '22023';
    END IF;
    IF r_email IS NULL OR r_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
    END IF;
    IF r_kind = 'warranty' AND r_serial IS NULL THEN
        RAISE EXCEPTION 'serial number is required' USING ERRCODE = '22023';
    END IF;
    IF r_kind = 'assistance' AND r_brand IS NULL THEN
        RAISE EXCEPTION 'brand is required' USING ERRCODE = '22023';
    END IF;
    IF r_date IS NOT NULL AND (r_date > current_date + 1 OR r_date < DATE '1990-01-01') THEN
        RAISE EXCEPTION 'invalid purchase date' USING ERRCODE = '22023';
    END IF;
    IF coalesce(request->>'privacy_accepted', '') <> 'true' THEN
        RAISE EXCEPTION 'privacy notice must be accepted' USING ERRCODE = '22023';
    END IF;

    IF u_id IS NOT NULL THEN
        UPDATE service_uploads SET used = true
         WHERE id = u_id AND link_id = l.id AND NOT used;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid upload' USING ERRCODE = '22023';
        END IF;
        -- A lista vem do que realmente está no bucket, não do navegador.
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'path', o.name,
                   'folder', (storage.foldername(o.name))[2],
                   'mime', o.metadata->>'mimetype',
                   'size', (o.metadata->>'size')::BIGINT) ORDER BY o.created_at), '[]'::jsonb)
          INTO r_files
          FROM storage.objects o
         WHERE o.bucket_id = 'service-intake' AND o.name LIKE u_id::TEXT || '/%';
    END IF;

    INSERT INTO service_requests (kind, link_id, customer_name, email, phone, country, shop, purchase_date,
                                  brand, product, size, serial_number, problem, language, files, privacy_accepted_at)
    VALUES (r_kind, l.id, r_name, r_email,
            request_form_clean(request->>'phone', 60),
            request_form_clean(request->>'country', 80),
            request_form_clean(request->>'shop', 200),
            r_date, r_brand, r_prod,
            request_form_clean(request->>'size', 40),
            r_serial, r_prob,
            request_form_clean(request->>'language', 5),
            r_files, now())
    RETURNING code INTO r_code;

    RETURN jsonb_build_object('code', r_code);
EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.service_form_auth(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_service_request_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_form_check(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_form_start_upload(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_form_submit(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_upload_allowed(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.service_form_check(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_form_start_upload(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_form_submit(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_upload_allowed(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Arquivos (bucket privado)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'service-intake',
    'service-intake',
    false,
    10485760,                                -- 10 MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "service_intake_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "service_intake_auth_read" ON storage.objects;

CREATE POLICY "service_intake_public_insert"
    ON storage.objects FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'service-intake' AND public.service_upload_allowed(name));

CREATE POLICY "service_intake_auth_read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'service-intake');

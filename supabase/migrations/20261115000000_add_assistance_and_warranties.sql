-- ============================================================================
-- Unificação: traz as Assistências (tickets) e as Garantias (warranties) do
-- antigo OM-Assist para o mesmo banco do OM-Shipment.
--
-- A estrutura das colunas é a mesma do banco antigo, com duas mudanças:
--   * datas passam a ser `timestamptz` (o banco antigo usava timestamp sem
--     fuso; os valores antigos são tratados como UTC na cópia);
--   * o número de protocolo da garantia (OMW-AA-NNN) passa a ser gerado aqui,
--     num trigger, e não mais no servidor — o servidor Express deixou de
--     existir e o app fala direto com o Supabase.
--
-- Segurança: mesmo modelo dos envios (20260903000000_enable_rls.sql) — dados
-- compartilhados, todo usuário autenticado lê e edita tudo; o papel anônimo
-- não tem acesso nenhum.
--
-- Rode o arquivo inteiro no SQL Editor do projeto do OM-Shipment. Pode ser
-- rodado de novo sem estragar nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tickets (
    id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_name      TEXT NOT NULL,
    client_email     TEXT NOT NULL,
    component        TEXT NOT NULL,
    brand            TEXT NOT NULL,
    serial_number    TEXT,
    problem          TEXT,
    protocol_number  TEXT,
    approval_status  TEXT,
    phase            TEXT NOT NULL,
    shipping_date    TIMESTAMPTZ,
    tracking_number  TEXT,
    shipping_company TEXT,
    completion_date  TIMESTAMPTZ,
    history          JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tickets IS 'Assistências: componentes enviados ao fabricante para reparo/análise.';

CREATE TABLE IF NOT EXISTS public.warranties (
    id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    start_date             TIMESTAMPTZ NOT NULL DEFAULT now(),
    customer_name          TEXT NOT NULL,
    email                  TEXT NOT NULL,
    agent                  TEXT NOT NULL,
    serial_number          TEXT NOT NULL,
    bike_model             TEXT NOT NULL,
    size                   TEXT NOT NULL,
    problem                TEXT NOT NULL,
    observation            TEXT,
    paint_details          TEXT,
    components_description TEXT,
    protocol_number        TEXT UNIQUE,
    process_type           TEXT NOT NULL DEFAULT 'Garantia',
    status                 TEXT NOT NULL DEFAULT 'In attesa',
    solution               TEXT,
    producer               TEXT,
    new_serial_number      TEXT,
    order_number           TEXT,
    value                  TEXT,
    invoice                TEXT,
    images                 JSONB,
    history                JSONB,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.warranties IS 'Processos de garantia de quadros/bicicletas.';
COMMENT ON COLUMN public.warranties.images IS 'URLs públicas das fotos no bucket warranty-images.';

CREATE INDEX IF NOT EXISTS tickets_created_at_idx    ON public.tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS warranties_created_at_idx ON public.warranties (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Número de protocolo da garantia: OMW-<ano com 2 dígitos>-<sequência>
-- ---------------------------------------------------------------------------
-- O sistema antigo usava "total de garantias + 1" como sequência, que gera
-- número repetido depois de uma exclusão. Aqui a sequência continua a partir
-- do MAIOR número já usado, e um lock evita que dois cadastros simultâneos
-- peguem o mesmo número.

CREATE OR REPLACE FUNCTION public.set_warranty_protocol()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    IF NEW.protocol_number IS NOT NULL AND NEW.protocol_number <> '' THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('warranties.protocol_number'));

    SELECT COALESCE(MAX((regexp_match(protocol_number, '^OMW-\d{2}-(\d+)$'))[1]::INTEGER), 0) + 1
      INTO next_number
      FROM public.warranties;

    NEW.protocol_number := 'OMW-' || to_char(now(), 'YY') || '-' || lpad(next_number::TEXT, 3, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warranties_set_protocol ON public.warranties;
CREATE TRIGGER warranties_set_protocol
    BEFORE INSERT ON public.warranties
    FOR EACH ROW EXECUTE FUNCTION public.set_warranty_protocol();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_authenticated_full_access"    ON public.tickets;
DROP POLICY IF EXISTS "warranties_authenticated_full_access" ON public.warranties;

CREATE POLICY "tickets_authenticated_full_access"
    ON public.tickets FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "warranties_authenticated_full_access"
    ON public.warranties FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

REVOKE ALL ON public.tickets    FROM anon;
REVOKE ALL ON public.warranties FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Storage — bucket warranty-images (fotos das garantias)
-- ---------------------------------------------------------------------------
-- Leitura pública, como shipment-photos: o app grava a URL pública da foto em
-- warranties.images. Upload, alteração e remoção exigem login.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'warranty-images',
    'warranty-images',
    true,
    10485760,                                -- 10 MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
    SET public             = true,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "warranty_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "warranty_images_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "warranty_images_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "warranty_images_auth_delete" ON storage.objects;

CREATE POLICY "warranty_images_public_read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'warranty-images');

CREATE POLICY "warranty_images_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'warranty-images');

CREATE POLICY "warranty_images_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'warranty-images')
    WITH CHECK (bucket_id = 'warranty-images');

CREATE POLICY "warranty_images_auth_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'warranty-images');

-- ---------------------------------------------------------------------------
-- 5. Verificação
-- ---------------------------------------------------------------------------
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('tickets', 'warranties');
-- -- relrowsecurity precisa ser true nas duas
--
-- SELECT tablename, policyname, roles FROM pg_policies WHERE tablename IN ('tickets', 'warranties');
--
-- SELECT id, public FROM storage.buckets WHERE id = 'warranty-images';
-- ============================================================================

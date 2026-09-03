-- ============================================================================
-- Comprovante de entrega (POD — Proof of Delivery)
--
-- Guarda o comprovante que hoje é baixado à mão do portal da transportadora.
-- É a única via possível para a maior parte dos envios: comprovante assinado é
-- dado de titular de conta na transportadora, e os envios feitos via MBE e My
-- Parcel estão na conta do revendedor, não na nossa.
--
-- Ao contrário das fotos, este bucket é PRIVADO: um POD traz assinatura, nome e
-- endereço do cliente. A tabela guarda o CAMINHO do arquivo, não uma URL
-- pública; o app gera URL assinada de curta duração na hora de exibir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coluna
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS pod_files TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.shipments.pod_files IS
    'Caminhos dos comprovantes de entrega no bucket privado shipment-pods. Não são URLs públicas: o app gera URL assinada para exibir.';

-- ---------------------------------------------------------------------------
-- 2. Bucket privado
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'shipment-pods',
    'shipment-pods',
    false,                                   -- privado, ao contrário de shipment-photos
    10485760,                                -- 10 MB por arquivo
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. Políticas — só usuário autenticado, inclusive para ler
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "shipment_pods_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "shipment_pods_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "shipment_pods_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "shipment_pods_auth_delete" ON storage.objects;

CREATE POLICY "shipment_pods_auth_select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'shipment-pods');

CREATE POLICY "shipment_pods_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'shipment-pods');

CREATE POLICY "shipment_pods_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'shipment-pods')
    WITH CHECK (bucket_id = 'shipment-pods');

CREATE POLICY "shipment_pods_auth_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'shipment-pods');

-- ---------------------------------------------------------------------------
-- 4. Verificação
-- ---------------------------------------------------------------------------
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'shipment-pods';
-- -- public precisa ser false

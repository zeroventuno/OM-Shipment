-- ============================================================================
-- SEGURANÇA: ativa Row Level Security e restringe todo o acesso a usuários
-- autenticados.
--
-- ANTES desta migration a tabela shipments estava aberta: qualquer pessoa com
-- a anon key (que vai no bundle público do navegador) conseguia ler, gravar e
-- apagar os 673 registros.
--
-- Modelo escolhido: dados compartilhados. Todo usuário autenticado enxerga e
-- edita todos os envios. O cadastro público deve ficar DESLIGADO no painel
-- (Authentication > Providers > Email > "Allow new users to sign up" = off);
-- os usuários são criados manualmente em Authentication > Users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabela shipments
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- Remove qualquer política permissiva pré-existente antes de recriar.
DROP POLICY IF EXISTS "Enable read access for all users"      ON public.shipments;
DROP POLICY IF EXISTS "Enable insert for all users"           ON public.shipments;
DROP POLICY IF EXISTS "Enable update for all users"           ON public.shipments;
DROP POLICY IF EXISTS "Enable delete for all users"           ON public.shipments;
DROP POLICY IF EXISTS "shipments_authenticated_full_access"   ON public.shipments;

-- Uma única política para todas as operações: exige sessão autenticada.
-- Sem política para o papel `anon`, o acesso anônimo fica bloqueado.
CREATE POLICY "shipments_authenticated_full_access"
    ON public.shipments
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Revoga privilégios diretos do papel anônimo (cinto e suspensório: mesmo que
-- alguém crie uma política permissiva por engano no futuro, o GRANT não existe).
REVOKE ALL ON public.shipments FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Storage — bucket shipment-photos
-- ---------------------------------------------------------------------------
-- Leitura continua pública: as URLs já gravadas em shipments.photo_urls são
-- URLs públicas e quebrariam se o bucket virasse privado. Os nomes de arquivo
-- são aleatórios e o bucket não permite listagem, então não são enumeráveis.
-- Upload, alteração e remoção passam a exigir autenticação.

DROP POLICY IF EXISTS "shipment_photos_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "shipment_photos_auth_insert"    ON storage.objects;
DROP POLICY IF EXISTS "shipment_photos_auth_update"    ON storage.objects;
DROP POLICY IF EXISTS "shipment_photos_auth_delete"    ON storage.objects;

CREATE POLICY "shipment_photos_public_read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'shipment-photos');

CREATE POLICY "shipment_photos_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'shipment-photos');

CREATE POLICY "shipment_photos_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'shipment-photos')
    WITH CHECK (bucket_id = 'shipment-photos');

CREATE POLICY "shipment_photos_auth_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'shipment-photos');

-- ---------------------------------------------------------------------------
-- 3. Verificação
-- ---------------------------------------------------------------------------
-- Depois de aplicar, rode no SQL Editor para conferir:
--
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'shipments';
--   -- relrowsecurity deve ser true
--
--   SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'shipments';
--   -- deve listar apenas shipments_authenticated_full_access / {authenticated}

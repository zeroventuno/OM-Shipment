-- ============================================================================
-- Arquivos internos da empresa (ex.: assinatura e carimbo do representante legal)
--
-- Ficam no banco, e não na pasta pública do site, para que só a equipe logada
-- consiga ler. O formulário aberto (/pedido) usa o papel anon e não tem acesso.
-- A gravação é feita só pelo administrador (script/SQL), não pela aplicação.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_assets (
    key         TEXT PRIMARY KEY,
    mime_type   TEXT NOT NULL,
    data_base64 TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_assets IS 'Imagens internas (assinatura/carimbo) usadas nos documentos gerados. Leitura só para usuários logados.';

ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_assets_authenticated_read" ON public.company_assets;
CREATE POLICY "company_assets_authenticated_read" ON public.company_assets
    FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.company_assets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.company_assets FROM authenticated;

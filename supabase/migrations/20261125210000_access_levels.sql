-- ============================================================================
-- Acessos por login
--
-- Um painel (menu Accessi), só para quem está em app_admins (o Cristiano),
-- lista os logins e define o acesso de cada um às áreas restritas. Por ora a
-- área restrita é Ferie, com três níveis:
--   none    → não vê o menu Ferie e o banco não devolve nada de férias
--   view    → vê tudo dentro de Ferie, mas não aprova nem muda nada
--   approve → acesso total a Ferie: aprova, nega, cadastra e edita
-- O próprio administrador também tem um nível de Ferie (começa em approve) e
-- pode baixá-lo depois; o painel de acessos continua dele.
--
-- O NFC continua como está (nfc_admins). Os links pessoais (/ferie/<token>)
-- não dependem de login e não mudam.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_admins (
    user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_admins FROM PUBLIC, anon, authenticated;

-- Cristiano
INSERT INTO public.app_admins (user_id)
SELECT id FROM auth.users WHERE id = '2454d12f-baa3-423f-a2c5-82b1e6011f61'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_access (
    user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    ferie      TEXT NOT NULL DEFAULT 'none' CHECK (ferie IN ('none', 'view', 'approve')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID
);
COMMENT ON TABLE public.user_access IS 'Acesso de cada login às áreas restritas (por ora Ferie). Só pelas funções access_*.';
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_access FROM PUBLIC, anon, authenticated;

-- Enquanto configura e testa, o administrador tem acesso total a Ferie.
INSERT INTO public.user_access (user_id, ferie)
SELECT user_id, 'approve' FROM public.app_admins
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$$;

-- Nível de Ferie do login atual.
CREATE OR REPLACE FUNCTION public.ferie_level()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT ferie FROM user_access WHERE user_id = auth.uid()), 'none');
$$;

-- Para o menu: o que o login atual pode ver.
CREATE OR REPLACE FUNCTION public.my_access()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object('admin', is_app_admin(), 'ferie', ferie_level());
$$;

-- Painel: logins com o nível de cada um (só administrador).
CREATE OR REPLACE FUNCTION public.access_admin_list()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT is_app_admin() THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'user_id', u.id, 'email', u.email, 'last_sign_in_at', u.last_sign_in_at,
            'admin', EXISTS (SELECT 1 FROM app_admins a WHERE a.user_id = u.id),
            'ferie', COALESCE(x.ferie, 'none')) ORDER BY u.email)
          FROM auth.users u LEFT JOIN user_access x ON x.user_id = u.id
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.access_admin_set(target UUID, area TEXT, level TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT is_app_admin() THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    IF area <> 'ferie' OR level NOT IN ('none', 'view', 'approve') THEN
        RAISE EXCEPTION 'invalid access' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target) THEN
        RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO user_access (user_id, ferie, updated_at, updated_by)
    VALUES (target, level, now(), auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET ferie = EXCLUDED.ferie, updated_at = now(), updated_by = auth.uid();
    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ferie_level() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.access_admin_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.access_admin_set(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ferie_level() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_admin_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_admin_set(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas de Ferie: ler com view/approve, mudar só com approve
-- ---------------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['employees', 'vans', 'leave_requests', 'agenda_events', 'sectors'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_full_access', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ferie_read', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ferie_write', t);
        EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.ferie_level() IN ('view', 'approve'))$p$, t || '_ferie_read', t);
        EXECUTE format($p$CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.ferie_level() = 'approve') WITH CHECK (public.ferie_level() = 'approve')$p$, t || '_ferie_write', t);
    END LOOP;
END $$;

-- Preferências: as de Ferie seguem a mesma regra; as outras ficam abertas a quem tem login.
DROP POLICY IF EXISTS "app_settings_authenticated_full_access" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings FOR SELECT TO authenticated
    USING (key NOT LIKE 'ferie.%' OR public.ferie_level() IN ('view', 'approve'));
CREATE POLICY "app_settings_write" ON public.app_settings FOR ALL TO authenticated
    USING (key NOT LIKE 'ferie.%' OR public.ferie_level() = 'approve')
    WITH CHECK (key NOT LIKE 'ferie.%' OR public.ferie_level() = 'approve');

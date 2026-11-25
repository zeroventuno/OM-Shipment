-- ============================================================================
-- Acessos: ligar e desligar as outras áreas por login
--
-- Além de Ferie (none/view/approve), cada login pode ter as áreas do
-- Gestionale ligadas ou desligadas: spedizioni, assistenza, garanzie,
-- richieste (pedidos de assistência dos clientes), clienti, referenti e
-- report. user_access.areas guarda só as desligadas ({"assistenza": false});
-- o que não está lá fica ligado, então ninguém perde nada com esta mudança.
--
-- Estas áreas são escondidas no menu e nas páginas. Os dados continuam
-- ligados entre si (um envio precisa dos clientes, a ficha do cliente mostra
-- envios e garantias), por isso o banco não bloqueia a leitura delas como
-- faz com Ferie.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.user_access ADD COLUMN IF NOT EXISTS areas JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.my_access()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'admin', is_app_admin(),
        'ferie', ferie_level(),
        'areas', COALESCE((SELECT areas FROM user_access WHERE user_id = auth.uid()), '{}'::jsonb));
$$;

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
            'ferie', COALESCE(x.ferie, 'none'),
            'areas', COALESCE(x.areas, '{}'::jsonb)) ORDER BY u.email)
          FROM auth.users u LEFT JOIN user_access x ON x.user_id = u.id
    ), '[]'::jsonb);
END;
$$;

-- area = 'ferie' com level none/view/approve, ou uma das áreas com level on/off.
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
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target) THEN
        RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
    END IF;

    IF area = 'ferie' THEN
        IF level NOT IN ('none', 'view', 'approve') THEN
            RAISE EXCEPTION 'invalid access' USING ERRCODE = '22023';
        END IF;
        INSERT INTO user_access (user_id, ferie, updated_at, updated_by)
        VALUES (target, level, now(), auth.uid())
        ON CONFLICT (user_id) DO UPDATE SET ferie = EXCLUDED.ferie, updated_at = now(), updated_by = auth.uid();
    ELSIF area IN ('spedizioni', 'assistenza', 'garanzie', 'richieste', 'clienti', 'referenti', 'report') AND level IN ('on', 'off') THEN
        INSERT INTO user_access (user_id, areas, updated_at, updated_by)
        VALUES (target, CASE WHEN level = 'off' THEN jsonb_build_object(area, false) ELSE '{}'::jsonb END, now(), auth.uid())
        ON CONFLICT (user_id) DO UPDATE
           SET areas = CASE WHEN level = 'off' THEN user_access.areas || jsonb_build_object(area, false)
                            ELSE user_access.areas - area END,
               updated_at = now(), updated_by = auth.uid();
    ELSE
        RAISE EXCEPTION 'invalid access' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================================
-- Painel Agenti também no link pessoal do dono (2026-11-26)
--
-- hub_dashboard_viewers: quem vê, pelo próprio link pessoal, os números de
-- todos os agentes (o mesmo painel /agents do Gestionale). Começa só com o
-- Giovanni. O link não tem senha: quem estiver aqui deve guardar o link só
-- para si.
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hub_dashboard_viewers (
    employee_id UUID PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hub_dashboard_viewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_dashboard_viewers FROM anon;
DROP POLICY IF EXISTS hub_dashboard_viewers_admin ON public.hub_dashboard_viewers;
CREATE POLICY hub_dashboard_viewers_admin ON public.hub_dashboard_viewers FOR ALL TO authenticated
    USING (is_app_admin()) WITH CHECK (is_app_admin());

INSERT INTO public.hub_dashboard_viewers (employee_id)
SELECT id FROM public.employees WHERE first_name = 'Giovanni' AND last_name = 'Monge'
ON CONFLICT DO NOTHING;

-- Os dados do painel, sem checagem (quem chama checa).
CREATE OR REPLACE FUNCTION public.agents_dashboard_data(y INT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'year', y,
        'om', om_stats(y),
        'agents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', e.id, 'name', employee_display_name(e), 'sector', e.primary_sector, 'active', e.active,
                'stats', agent_stats_for(e.id, y)) ORDER BY employee_display_name(e))
              FROM employees e
             WHERE 'commerciali' IN (e.primary_sector, COALESCE(e.secondary_sector, ''))
                OR EXISTS (SELECT 1 FROM shipments s WHERE s.employee_id = e.id AND extract(year FROM s.created_at AT TIME ZONE 'Europe/Rome') = y)
                OR EXISTS (SELECT 1 FROM warranties w WHERE w.employee_id = e.id)
                OR EXISTS (SELECT 1 FROM tickets t WHERE t.employee_id = e.id)
        ), '[]'::jsonb)
    );
$$;

CREATE OR REPLACE FUNCTION public.agents_dashboard(p_year INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (my_access()->'areas'->>'report') = 'false' THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN agents_dashboard_data(COALESCE(p_year, extract(year FROM now() AT TIME ZONE 'Europe/Rome')::INT));
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_agents_dashboard(token TEXT, p_year INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
    y INT := COALESCE(p_year, extract(year FROM now() AT TIME ZONE 'Europe/Rome')::INT);
BEGIN
    e := ferie_form_auth(token);
    IF NOT EXISTS (SELECT 1 FROM hub_dashboard_viewers v WHERE v.employee_id = e.id) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    IF y < 2020 OR y > extract(year FROM now())::INT THEN y := extract(year FROM now())::INT; END IF;
    RETURN agents_dashboard_data(y);
END;
$$;

-- O link sabe se mostra a aba (sem precisar chamar o painel para descobrir).
CREATE OR REPLACE FUNCTION public.hub_can_see_agents(token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
BEGIN
    e := ferie_form_auth(token);
    RETURN EXISTS (SELECT 1 FROM hub_dashboard_viewers v WHERE v.employee_id = e.id);
END;
$$;

REVOKE ALL ON FUNCTION public.agents_dashboard_data(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_agents_dashboard(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_agents_dashboard(TEXT, INT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_can_see_agents(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_can_see_agents(TEXT) TO anon, authenticated;

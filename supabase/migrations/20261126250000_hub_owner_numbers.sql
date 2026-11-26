-- ============================================================================
-- Números dos agentes no link pessoal do dono (2026-11-26)
--
-- Decisão do Cristiano: no link pessoal do Giovanni, a parte "Números" tem
-- duas abas: os dele e os de todos os agentes (o mesmo painel do Gestionale).
-- Se ele quiser tirar, pede. Quem vê fica em hub_dashboard_viewers; o link
-- não tem senha, por isso a lista começa só com ele.
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

-- Os números da pessoa; 'owner' diz se ela também vê os de todos os agentes.
CREATE OR REPLACE FUNCTION public.hub_agent_stats(token TEXT, p_year INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
    y INT := COALESCE(p_year, extract(year FROM now() AT TIME ZONE 'Europe/Rome')::INT);
    me JSONB;
    om JSONB;
    owner BOOLEAN;
BEGIN
    e := ferie_form_auth(token);
    IF y < 2020 OR y > extract(year FROM now())::INT THEN y := extract(year FROM now())::INT; END IF;
    me := agent_stats_for(e.id, y);
    om := om_stats(y);
    owner := EXISTS (SELECT 1 FROM hub_dashboard_viewers v WHERE v.employee_id = e.id);
    RETURN jsonb_build_object(
        'year', y,
        'owner', owner,
        -- painel de números: comerciais, quem já tem envios/casos ligados, ou o dono
        'show', owner OR 'commerciali' IN (e.primary_sector, COALESCE(e.secondary_sector, ''))
                OR EXISTS (SELECT 1 FROM shipments WHERE employee_id = e.id)
                OR EXISTS (SELECT 1 FROM warranties WHERE employee_id = e.id)
                OR EXISTS (SELECT 1 FROM tickets WHERE employee_id = e.id),
        'me', me,
        -- da OM, só as contagens (o lucro da empresa fica com o escritório)
        'om', jsonb_build_object(
            'n', om->'n',
            'by_type', COALESCE((SELECT jsonb_agg(x - 'profit') FROM jsonb_array_elements(om->'by_type') x), '[]'::jsonb))
    );
END;
$$;

-- Todos os agentes pelo link, só para quem está na lista.
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

REVOKE ALL ON FUNCTION public.hub_agent_stats(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_agent_stats(TEXT, INT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_agents_dashboard(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_agents_dashboard(TEXT, INT) TO anon, authenticated;

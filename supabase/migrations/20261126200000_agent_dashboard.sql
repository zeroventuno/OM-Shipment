-- ============================================================================
-- Agenda e numeri dell'agente (2026-11-26)
--
-- 1. Assistenze (tickets) ganham agente, como as garantias: coluna agent (texto
--    livre) + employee_id ligado a Persone pelo mesmo gatilho dos envios.
--    Quando um pedido do link pessoal vira assistência ou garantia, o caso
--    recebe o nome de quem pediu (se ainda não tiver agente).
-- 2. agent_stats_for / om_stats: números de um ano (envios por tipo, lucro ou
--    prejuízo, garantias e assistências por fase).
-- 3. hub_agent_stats(token, year): o link pessoal vê os PRÓPRIOS números e só
--    a contagem total da OM (sem o lucro da empresa nem o dos colegas).
-- 4. agents_dashboard(year): todos os agentes lado a lado, só para quem tem a
--    área Report ligada (o dono).
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

-- 1. Agente nas assistências ---------------------------------------------------

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS agent TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tickets_employee_id_idx ON public.tickets(employee_id);
COMMENT ON COLUMN public.tickets.agent       IS 'Agente commerciale (testo libero, come in warranties.agent).';
COMMENT ON COLUMN public.tickets.employee_id IS 'Agente em Persone, ligado pelo nome de agent.';

DROP TRIGGER IF EXISTS tickets_link_agent ON public.tickets;
CREATE TRIGGER tickets_link_agent BEFORE INSERT OR UPDATE OF agent ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.link_agent_employee();

-- Pedido do link pessoal convertido: o caso herda quem pediu.
CREATE OR REPLACE FUNCTION public.service_request_case_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    who TEXT;
BEGIN
    IF NEW.employee_id IS NULL THEN RETURN NEW; END IF;
    SELECT employee_display_name(e) INTO who FROM employees e WHERE e.id = NEW.employee_id;
    IF who IS NULL THEN RETURN NEW; END IF;
    IF NEW.ticket_id IS NOT NULL AND NEW.ticket_id IS DISTINCT FROM OLD.ticket_id THEN
        UPDATE tickets SET agent = who WHERE id = NEW.ticket_id AND NULLIF(trim(agent), '') IS NULL;
    END IF;
    IF NEW.warranty_id IS NOT NULL AND NEW.warranty_id IS DISTINCT FROM OLD.warranty_id THEN
        UPDATE warranties SET agent = who WHERE id = NEW.warranty_id AND NULLIF(trim(agent), '') IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_requests_case_agent ON public.service_requests;
CREATE TRIGGER service_requests_case_agent AFTER UPDATE OF ticket_id, warranty_id ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.service_request_case_agent();

-- Os pedidos já convertidos: só preenche agente vazio.
UPDATE public.tickets t SET agent = employee_display_name(e)
  FROM public.service_requests r JOIN public.employees e ON e.id = r.employee_id
 WHERE r.ticket_id = t.id AND NULLIF(trim(t.agent), '') IS NULL;

-- 2. Números -------------------------------------------------------------------

-- Tipo do envio normalizado (vazio = Other).
CREATE OR REPLACE FUNCTION public.shipment_kind(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(NULLIF(trim(t), ''), 'Other') $$;

CREATE OR REPLACE FUNCTION public.agent_stats_for(p_emp UUID, p_year INT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH s AS (
        SELECT shipment_kind(order_type) AS kind, COALESCE(profit, 0) AS profit
          FROM shipments
         WHERE employee_id = p_emp AND extract(year FROM created_at AT TIME ZONE 'Europe/Rome') = p_year
    ), w AS (
        SELECT status, extract(year FROM created_at AT TIME ZONE 'Europe/Rome') = p_year AS this_year FROM warranties WHERE employee_id = p_emp
    ), k AS (
        SELECT phase, extract(year FROM created_at AT TIME ZONE 'Europe/Rome') = p_year AS this_year FROM tickets WHERE employee_id = p_emp
    )
    SELECT jsonb_build_object(
        'shipments', jsonb_build_object(
            'n', (SELECT count(*) FROM s),
            'profit', (SELECT round(COALESCE(sum(profit), 0), 2) FROM s),
            'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', kind, 'n', n, 'profit', p) ORDER BY n DESC)
                                   FROM (SELECT kind, count(*) n, round(sum(profit), 2) p FROM s GROUP BY kind) x), '[]'::jsonb)),
        'warranties', jsonb_build_object(
            'total', (SELECT count(*) FROM w),
            'year', (SELECT count(*) FROM w WHERE this_year),
            'open', (SELECT count(*) FROM w WHERE status IS DISTINCT FROM 'Completato'),
            'by_status', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT COALESCE(status, '') status, count(*) n FROM w GROUP BY 1) x), '{}'::jsonb)),
        'tickets', jsonb_build_object(
            'total', (SELECT count(*) FROM k),
            'year', (SELECT count(*) FROM k WHERE this_year),
            'open', (SELECT count(*) FROM k WHERE phase IS DISTINCT FROM 'Completato'),
            'by_phase', COALESCE((SELECT jsonb_object_agg(phase, n) FROM (SELECT COALESCE(phase, '') phase, count(*) n FROM k GROUP BY 1) x), '{}'::jsonb))
    );
$$;

CREATE OR REPLACE FUNCTION public.om_stats(p_year INT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH s AS (
        SELECT shipment_kind(order_type) AS kind, COALESCE(profit, 0) AS profit, employee_id
          FROM shipments WHERE extract(year FROM created_at AT TIME ZONE 'Europe/Rome') = p_year
    )
    SELECT jsonb_build_object(
        'n', (SELECT count(*) FROM s),
        'with_agent', (SELECT count(*) FROM s WHERE employee_id IS NOT NULL),
        'profit', (SELECT round(COALESCE(sum(profit), 0), 2) FROM s),
        'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', kind, 'n', n, 'profit', p) ORDER BY n DESC)
                               FROM (SELECT kind, count(*) n, round(sum(profit), 2) p FROM s GROUP BY kind) x), '[]'::jsonb),
        'warranties_open', (SELECT count(*) FROM warranties WHERE status IS DISTINCT FROM 'Completato'),
        'tickets_open', (SELECT count(*) FROM tickets WHERE phase IS DISTINCT FROM 'Completato')
    );
$$;

-- 3. Link pessoal ---------------------------------------------------------------

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
BEGIN
    e := ferie_form_auth(token);
    IF y < 2020 OR y > extract(year FROM now())::INT THEN y := extract(year FROM now())::INT; END IF;
    me := agent_stats_for(e.id, y);
    om := om_stats(y);
    RETURN jsonb_build_object(
        'year', y,
        -- painel de números: comerciais, ou quem já tem envios/casos ligados
        'show', 'commerciali' IN (e.primary_sector, COALESCE(e.secondary_sector, ''))
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

-- 4. Painel do dono -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agents_dashboard(p_year INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    y INT := COALESCE(p_year, extract(year FROM now() AT TIME ZONE 'Europe/Rome')::INT);
BEGIN
    IF auth.uid() IS NULL OR (my_access()->'areas'->>'report') = 'false' THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
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
END;
$$;

-- Permissões --------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.service_request_case_agent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_stats_for(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.om_stats(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_agent_stats(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_agent_stats(TEXT, INT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.agents_dashboard(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agents_dashboard(INT) TO authenticated;

-- ============================================================================
-- Agente ligado a Persone (2026-11-26)
--
-- Envios (shipments.agent), garantias (warranties.agent) e pedidos de envio
-- (shipment_requests.requested_by) guardam o agente como texto livre. Aqui eles
-- ganham employee_id, ligado pelo nome a Persone (autorizado pelo Cristiano em
-- 26/11: não há nomes iguais). O texto continua igual; nada é apagado.
--
-- Regra do par: nome e sobrenome iguais (sem maiúsculas e espaços extras), ou,
-- se um dos dois é só o primeiro nome, o primeiro nome igual, desde que só UMA
-- pessoa tenha esse primeiro nome, ou um sobrenome a mais de um dos lados
-- ("Stella Monge Roffarello" = "Stella Monge"). Sem par ou com dúvida: fica vazio.
-- Um gatilho liga os registros novos e os editados.
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.shipments  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.warranties ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shipments_employee_idx  ON public.shipments (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS warranties_employee_idx ON public.warranties (employee_id) WHERE employee_id IS NOT NULL;
COMMENT ON COLUMN public.shipments.employee_id  IS 'Agente em Persone, ligado pelo nome de agent.';
COMMENT ON COLUMN public.warranties.employee_id IS 'Agente em Persone, ligado pelo nome de agent.';

CREATE OR REPLACE FUNCTION public.agent_norm(t TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(regexp_replace(lower(trim(coalesce(t, ''))), '\s+', ' ', 'g'), '');
$$;

-- A pessoa de Persone que corresponde ao nome escrito, ou NULL.
CREATE OR REPLACE FUNCTION public.employee_for_agent(p_agent TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    a   TEXT := agent_norm(p_agent);
    ids UUID[];
BEGIN
    IF a IS NULL THEN RETURN NULL; END IF;
    SELECT array_agg(id) INTO ids FROM employees e
     WHERE agent_norm(employee_display_name(e)) = a OR agent_norm(e.name) = a;
    IF cardinality(ids) = 1 THEN RETURN ids[1]; END IF;
    IF cardinality(ids) > 1 THEN RETURN NULL; END IF;
    SELECT array_agg(id) INTO ids FROM employees e
     WHERE split_part(agent_norm(employee_display_name(e)), ' ', 1) = split_part(a, ' ', 1)
       AND (position(' ' IN a) = 0 OR position(' ' IN agent_norm(employee_display_name(e))) = 0);
    IF cardinality(ids) = 1 THEN RETURN ids[1]; END IF;
    IF cardinality(ids) > 1 THEN RETURN NULL; END IF;
    -- Sobrenome a mais de um dos lados: "Stella Monge Roffarello" = "Stella Monge".
    SELECT array_agg(id) INTO ids FROM employees e
     WHERE position(' ' IN agent_norm(employee_display_name(e))) > 0 AND position(' ' IN a) > 0
       AND (a LIKE agent_norm(employee_display_name(e)) || ' %' OR agent_norm(employee_display_name(e)) LIKE a || ' %');
    IF cardinality(ids) = 1 THEN RETURN ids[1]; END IF;
    RETURN NULL;
END;
$$;

-- Registro novo ou agente editado: liga de novo.
CREATE OR REPLACE FUNCTION public.link_agent_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'shipment_requests' THEN
        IF NEW.employee_id IS NULL THEN NEW.employee_id := employee_for_agent(NEW.requested_by); END IF;
    ELSIF TG_OP = 'INSERT' OR NEW.agent IS DISTINCT FROM OLD.agent THEN
        NEW.employee_id := employee_for_agent(NEW.agent);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_link_agent ON public.shipments;
CREATE TRIGGER shipments_link_agent BEFORE INSERT OR UPDATE OF agent ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION public.link_agent_employee();
DROP TRIGGER IF EXISTS warranties_link_agent ON public.warranties;
CREATE TRIGGER warranties_link_agent BEFORE INSERT OR UPDATE OF agent ON public.warranties
    FOR EACH ROW EXECUTE FUNCTION public.link_agent_employee();
-- Depois do gatilho do link pessoal (ordem alfabética: "…_employee" < "…_link_agent").
DROP TRIGGER IF EXISTS shipment_requests_link_agent ON public.shipment_requests;
CREATE TRIGGER shipment_requests_link_agent BEFORE INSERT ON public.shipment_requests
    FOR EACH ROW EXECUTE FUNCTION public.link_agent_employee();

-- Quem for cadastrado em Persone depois NÃO liga os registros antigos sozinho:
-- isso dispararia os gatilhos de sincronia dos envios. Para ligar de novo, rode
-- de novo o bloco abaixo (é seguro repetir).
DROP TRIGGER IF EXISTS employees_relink_agents ON public.employees;
DROP FUNCTION IF EXISTS public.relink_agents_for_employees();

-- Liga o que já existe. Só preenche employee_id; agent e requested_by não mudam.
-- Os gatilhos das tabelas ficam desligados só durante estes UPDATE, para não
-- mexer em updated_at nem rodar as sincronias de envio (processo, pedido, retirada).
ALTER TABLE public.shipments DISABLE TRIGGER USER;
ALTER TABLE public.warranties DISABLE TRIGGER USER;
ALTER TABLE public.shipment_requests DISABLE TRIGGER USER;
UPDATE public.shipments  SET employee_id = public.employee_for_agent(agent)        WHERE employee_id IS NULL AND public.agent_norm(agent) IS NOT NULL;
UPDATE public.warranties SET employee_id = public.employee_for_agent(agent)        WHERE employee_id IS NULL AND public.agent_norm(agent) IS NOT NULL;
UPDATE public.shipment_requests SET employee_id = public.employee_for_agent(requested_by) WHERE employee_id IS NULL;
ALTER TABLE public.shipments ENABLE TRIGGER USER;
ALTER TABLE public.warranties ENABLE TRIGGER USER;
ALTER TABLE public.shipment_requests ENABLE TRIGGER USER;

REVOKE ALL ON FUNCTION public.agent_norm(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_for_agent(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_agent_employee() FROM PUBLIC, anon, authenticated;

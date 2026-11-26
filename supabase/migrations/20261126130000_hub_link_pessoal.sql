-- ============================================================================
-- Link pessoal como ponto de entrada de tudo (2026-11-26)
--
-- O link /ferie/<token> de cada pessoa passa a pedir também envio, retirada e
-- assistência/garantia para um cliente. Em vez de reescrever os formulários,
-- cada pessoa ganha, por trás do MESMO token, uma linha em request_links,
-- pickup_links e service_links (hash do token, como os outros links). Assim as
-- funções request_form_*, pickup_form_* e service_form_* aceitam o link pessoal
-- sem mudar nada, e o pedido cai na mesma fila de sempre (e no To Do).
--
-- O pedido feito pelo link pessoal leva employee_id: quem pediu é o agente.
-- No envio, requested_by recebe o nome da pessoa (não dá para digitar outro);
-- na assistência, source = 'agent'.
--
-- Os links gerais de cada serviço continuam funcionando como antes.
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. De quem é o link e quem pediu
-- ---------------------------------------------------------------------------

ALTER TABLE public.request_links ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.pickup_links  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.service_links ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS request_links_employee_idx ON public.request_links (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pickup_links_employee_idx  ON public.pickup_links  (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_links_employee_idx ON public.service_links (employee_id) WHERE employee_id IS NOT NULL;

ALTER TABLE public.shipment_requests ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.pickup_requests   ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.service_requests  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shipment_requests_employee_idx ON public.shipment_requests (employee_id, created_at DESC) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pickup_requests_employee_idx   ON public.pickup_requests   (employee_id, created_at DESC) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_requests_employee_idx  ON public.service_requests  (employee_id, created_at DESC) WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN public.shipment_requests.employee_id IS 'Quem pediu pelo link pessoal (agente). Vazio nos pedidos pelos links gerais.';
COMMENT ON COLUMN public.pickup_requests.employee_id   IS 'Quem pediu pelo link pessoal (agente). Vazio nos pedidos pelos links gerais.';
COMMENT ON COLUMN public.service_requests.employee_id  IS 'Quem pediu pelo link pessoal (agente). Vazio nos pedidos pelos links gerais.';

-- Nome de exibição: nome e sobrenome se houver, senão o nome antigo.
CREATE OR REPLACE FUNCTION public.employee_display_name(e public.employees)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(NULLIF(trim(concat_ws(' ', e.first_name, e.last_name)), ''), e.name);
$$;

-- ---------------------------------------------------------------------------
-- 2. Os três links acompanham o link pessoal
-- ---------------------------------------------------------------------------

-- Deixa as linhas da pessoa nas três tabelas iguais ao link pessoal: uma linha
-- ativa com o hash do token atual; as de tokens antigos ficam desativadas.
CREATE OR REPLACE FUNCTION public.sync_employee_service_links(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    e     employees;
    h     TEXT;
    lname TEXT;
    ok    BOOLEAN;
BEGIN
    SELECT * INTO e FROM employees WHERE id = p_id;
    IF NOT FOUND THEN RETURN; END IF;
    ok := e.active AND length(coalesce(e.link_token, '')) >= 20;
    h := CASE WHEN ok THEN encode(extensions.digest(e.link_token, 'sha256'), 'hex') END;
    lname := employee_display_name(e);

    UPDATE request_links SET active = false WHERE employee_id = e.id AND active AND token_hash IS DISTINCT FROM h;
    UPDATE pickup_links  SET active = false WHERE employee_id = e.id AND active AND token_hash IS DISTINCT FROM h;
    UPDATE service_links SET active = false WHERE employee_id = e.id AND active AND token_hash IS DISTINCT FROM h;
    IF NOT ok THEN RETURN; END IF;

    INSERT INTO request_links (name, token_hash, employee_id, active) VALUES (lname, h, e.id, true)
        ON CONFLICT (token_hash) DO UPDATE SET name = EXCLUDED.name, employee_id = EXCLUDED.employee_id, active = true;
    INSERT INTO pickup_links (name, token_hash, employee_id, active) VALUES (lname, h, e.id, true)
        ON CONFLICT (token_hash) DO UPDATE SET name = EXCLUDED.name, employee_id = EXCLUDED.employee_id, active = true;
    INSERT INTO service_links (name, token_hash, employee_id, active) VALUES (lname, h, e.id, true)
        ON CONFLICT (token_hash) DO UPDATE SET name = EXCLUDED.name, employee_id = EXCLUDED.employee_id, active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.employees_sync_service_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM sync_employee_service_links(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_sync_service_links ON public.employees;
CREATE TRIGGER employees_sync_service_links
    AFTER INSERT OR UPDATE OF link_token, active, name, first_name, last_name ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.employees_sync_service_links();

-- Quem já tem link pessoal ganha as três linhas agora.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.employees LOOP
        PERFORM public.sync_employee_service_links(r.id);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Pedido feito pelo link pessoal: a pessoa é o agente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_from_employee_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    emp UUID;
    e   employees;
BEGIN
    IF NEW.link_id IS NULL THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'shipment_requests' THEN
        SELECT employee_id INTO emp FROM request_links WHERE id = NEW.link_id;
    ELSIF TG_TABLE_NAME = 'pickup_requests' THEN
        SELECT employee_id INTO emp FROM pickup_links WHERE id = NEW.link_id;
    ELSE
        SELECT employee_id INTO emp FROM service_links WHERE id = NEW.link_id;
    END IF;
    IF emp IS NULL THEN RETURN NEW; END IF;

    NEW.employee_id := emp;
    IF TG_TABLE_NAME = 'shipment_requests' THEN
        SELECT * INTO e FROM employees WHERE id = emp;
        NEW.requested_by := employee_display_name(e);
    ELSIF TG_TABLE_NAME = 'service_requests' THEN
        NEW.source := 'agent';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipment_requests_employee ON public.shipment_requests;
CREATE TRIGGER shipment_requests_employee BEFORE INSERT ON public.shipment_requests
    FOR EACH ROW EXECUTE FUNCTION public.request_from_employee_link();
DROP TRIGGER IF EXISTS pickup_requests_employee ON public.pickup_requests;
CREATE TRIGGER pickup_requests_employee BEFORE INSERT ON public.pickup_requests
    FOR EACH ROW EXECUTE FUNCTION public.request_from_employee_link();
DROP TRIGGER IF EXISTS service_requests_employee ON public.service_requests;
CREATE TRIGGER service_requests_employee BEFORE INSERT ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.request_from_employee_link();

-- ---------------------------------------------------------------------------
-- 4. "Le mie richieste": retiradas e assistências que a pessoa pediu
-- ---------------------------------------------------------------------------
-- (Os envios já aparecem na aba Elenco do formulário de envio.)

CREATE OR REPLACE FUNCTION public.hub_my_requests(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
BEGIN
    e := ferie_form_auth(token);
    RETURN jsonb_build_object(
        'pickups', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id, 'code', p.code, 'created_at', p.created_at, 'status', p.status,
                'reason', p.reason, 'shop_name', p.shop_name, 'city', p.city, 'ready_from', p.ready_from,
                'tracking_code', NULLIF(s.tracking_code, ''),
                'carrier', NULLIF(trim(concat_ws(' / ', s.selected_quote->>'portal', s.selected_quote->>'carrier')), '')
            ) ORDER BY p.created_at DESC)
            FROM pickup_requests p LEFT JOIN shipments s ON s.id = p.shipment_id
            WHERE p.employee_id = e.id AND p.created_at > now() - interval '120 days'
        ), '[]'::jsonb),
        'services', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'code', r.code, 'created_at', r.created_at, 'status', r.status,
                'kind', r.kind, 'customer_name', r.customer_name, 'product', r.product,
                'ticket_id', r.ticket_id, 'warranty_id', r.warranty_id
            ) ORDER BY r.created_at DESC)
            FROM service_requests r
            WHERE r.employee_id = e.id AND r.created_at > now() - interval '120 days'
        ), '[]'::jsonb)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.employee_display_name(public.employees) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_employee_service_links(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employees_sync_service_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_from_employee_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_my_requests(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_my_requests(TEXT) TO anon, authenticated;

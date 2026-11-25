-- ============================================================================
-- Ferie: férias da equipe e agenda da empresa
--
-- Cada funcionário tem um setor principal e, se quiser, um secundário, e um
-- link pessoal (/ferie/<token>) para pedir férias e ver o mapa da equipe.
-- O funcionário NÃO tem login: um login veria o Gestionale inteiro.
--
-- Quem aprova usa o login normal (menu Ferie): aprova, nega ou sugere outra
-- data. A agenda guarda datas bloqueadas (ninguém sai), reuniões, viagens de
-- trabalho, reuniões externas e reservas dos furgões.
--
-- O link pessoal só devolve: o próprio funcionário, os pedidos dele e o mapa
-- (nomes, setores e datas; nunca a observação dos outros).
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employees (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    email            TEXT,
    primary_sector   TEXT NOT NULL CHECK (primary_sector IN ('officina', 'amministrazione', 'magazzino', 'commerciali', 'marketing', 'cycling_tour')),
    secondary_sector TEXT CHECK (secondary_sector IN ('officina', 'amministrazione', 'magazzino', 'commerciali', 'marketing', 'cycling_tour')),
    -- link pessoal; só quem tem login lê (para copiar de novo)
    link_token       TEXT UNIQUE,
    active           BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT employees_sectors_differ CHECK (secondary_sector IS NULL OR secondary_sector <> primary_sector)
);
COMMENT ON TABLE public.employees IS 'Funcionários para o controle de férias, com setor principal, secundário e link pessoal.';

CREATE TABLE IF NOT EXISTS public.vans (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    plate      TEXT,
    active     BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vans IS 'Furgões da empresa, para a agenda.';

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id    UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    -- meio dia só num dia só
    part           TEXT NOT NULL DEFAULT 'full' CHECK (part IN ('full', 'am', 'pm')),
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'proposed', 'cancelled')),
    proposed_start DATE,
    proposed_end   DATE,
    response_note  TEXT,
    decided_by     UUID,
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leave_dates_order CHECK (end_date >= start_date),
    CONSTRAINT leave_half_day CHECK (part = 'full' OR start_date = end_date),
    CONSTRAINT leave_proposal CHECK (status <> 'proposed' OR (proposed_start IS NOT NULL AND proposed_end >= proposed_start))
);
CREATE INDEX IF NOT EXISTS leave_requests_dates_idx ON public.leave_requests (start_date, end_date);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON public.leave_requests (status, created_at DESC);
COMMENT ON TABLE public.leave_requests IS 'Pedidos de férias: pendente, aprovado, negado, outra data sugerida ou cancelado.';

CREATE TABLE IF NOT EXISTS public.agenda_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- block = ninguém pode sair; meeting = reunião de equipe; travel = viagem de
    -- trabalho; external = reunião externa; van = reserva de furgão
    kind         TEXT NOT NULL CHECK (kind IN ('block', 'meeting', 'travel', 'external', 'van')),
    title        TEXT NOT NULL,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    start_time   TIME,
    end_time     TIME,
    -- block/meeting: setor envolvido (vazio = a empresa toda)
    sector       TEXT CHECK (sector IN ('officina', 'amministrazione', 'magazzino', 'commerciali', 'marketing', 'cycling_tour')),
    -- travel/external/meeting: pessoas envolvidas
    employee_ids UUID[] NOT NULL DEFAULT '{}',
    van_id       UUID REFERENCES public.vans(id) ON DELETE CASCADE,
    notes        TEXT,
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agenda_dates_order CHECK (end_date >= start_date),
    CONSTRAINT agenda_van CHECK (kind <> 'van' OR van_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS agenda_events_dates_idx ON public.agenda_events (start_date, end_date);
COMMENT ON TABLE public.agenda_events IS 'Agenda da empresa: datas bloqueadas, reuniões, viagens, reuniões externas e furgões.';

-- Quem tem login (a equipe do escritório) mexe em tudo; o link pessoal só
-- passa pelas funções ferie_form_*.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['employees', 'vans', 'leave_requests', 'agenda_events'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_full_access', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_authenticated_full_access', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS employees_touch ON public.employees;
CREATE TRIGGER employees_touch BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS leave_requests_touch ON public.leave_requests;
CREATE TRIGGER leave_requests_touch BEFORE UPDATE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS agenda_events_touch ON public.agenda_events;
CREATE TRIGGER agenda_events_touch BEFORE UPDATE ON public.agenda_events
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Funções do link pessoal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ferie_form_auth(token TEXT)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e public.employees;
BEGIN
    SELECT * INTO e FROM public.employees
     WHERE link_token = token AND length(coalesce(token, '')) >= 20 AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid or disabled link' USING ERRCODE = '28000';
    END IF;
    RETURN e;
END;
$$;

-- Bloqueio que pega o período (da empresa toda ou de um setor da pessoa).
CREATE OR REPLACE FUNCTION public.ferie_blocking_event(e public.employees, p_start DATE, p_end DATE)
RETURNS public.agenda_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.* FROM agenda_events a
     WHERE a.kind = 'block'
       AND a.start_date <= p_end AND a.end_date >= p_start
       AND (a.sector IS NULL OR a.sector IN (e.primary_sector, e.secondary_sector))
     ORDER BY a.start_date
     LIMIT 1;
$$;

-- Tudo o que o link mostra: a pessoa, os pedidos dela e o mapa da equipe
-- (de 1 mês atrás a 13 meses para a frente).
CREATE OR REPLACE FUNCTION public.ferie_form_data(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e      employees;
    w_from DATE := current_date - 31;
    w_to   DATE := current_date + 400;
BEGIN
    e := ferie_form_auth(token);
    RETURN jsonb_build_object(
        'me', jsonb_build_object('id', e.id, 'name', e.name,
            'primary_sector', e.primary_sector, 'secondary_sector', e.secondary_sector),
        'requests', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'start_date', r.start_date, 'end_date', r.end_date, 'part', r.part,
                'note', r.note, 'status', r.status, 'proposed_start', r.proposed_start,
                'proposed_end', r.proposed_end, 'response_note', r.response_note,
                'created_at', r.created_at) ORDER BY r.start_date DESC)
              FROM leave_requests r
             WHERE r.employee_id = e.id AND r.end_date >= current_date - 365), '[]'::jsonb),
        'employees', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name,
                'primary_sector', x.primary_sector, 'secondary_sector', x.secondary_sector) ORDER BY x.name)
              FROM employees x WHERE x.active), '[]'::jsonb),
        -- férias dos outros: só datas e situação
        'leaves', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'employee_id', r.employee_id, 'start_date', r.start_date,
                'end_date', r.end_date, 'part', r.part, 'status', r.status))
              FROM leave_requests r JOIN employees x ON x.id = r.employee_id AND x.active
             WHERE r.status IN ('pending', 'approved', 'proposed')
               AND r.start_date <= w_to AND r.end_date >= w_from), '[]'::jsonb),
        -- agenda sem furgões e sem observações
        'events', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'kind', a.kind, 'title', a.title, 'start_date', a.start_date,
                'end_date', a.end_date, 'start_time', a.start_time, 'end_time', a.end_time,
                'sector', a.sector, 'employee_ids', a.employee_ids))
              FROM agenda_events a
             WHERE a.kind <> 'van' AND a.start_date <= w_to AND a.end_date >= w_from), '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ferie_form_submit(token TEXT, request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e       employees;
    r_start DATE := NULLIF(trim(coalesce(request->>'start_date', '')), '')::DATE;
    r_end   DATE := NULLIF(trim(coalesce(request->>'end_date', '')), '')::DATE;
    r_part  TEXT := coalesce(NULLIF(request->>'part', ''), 'full');
    blk     agenda_events;
    recent  INTEGER;
    new_id  UUID;
BEGIN
    e := ferie_form_auth(token);

    SELECT count(*) INTO recent FROM leave_requests
     WHERE employee_id = e.id AND created_at > now() - interval '1 hour';
    IF recent >= 10 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    IF r_start IS NULL OR r_end IS NULL OR r_end < r_start
       OR r_start < current_date OR r_end > current_date + 400 OR r_end - r_start > 60 THEN
        RAISE EXCEPTION 'invalid dates' USING ERRCODE = '22023';
    END IF;
    IF r_part NOT IN ('full', 'am', 'pm') OR (r_part <> 'full' AND r_start <> r_end) THEN
        RAISE EXCEPTION 'invalid part of day' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM leave_requests r
                WHERE r.employee_id = e.id AND r.status IN ('pending', 'approved', 'proposed')
                  AND r.start_date <= r_end AND r.end_date >= r_start) THEN
        RAISE EXCEPTION 'overlaps another request' USING ERRCODE = '23P01';
    END IF;
    blk := ferie_blocking_event(e, r_start, r_end);
    IF blk.id IS NOT NULL THEN
        RAISE EXCEPTION 'blocked: % (% - %)', blk.title, to_char(blk.start_date, 'DD/MM/YYYY'), to_char(blk.end_date, 'DD/MM/YYYY')
            USING ERRCODE = 'P0001', HINT = 'blocked';
    END IF;

    INSERT INTO leave_requests (employee_id, start_date, end_date, part, note)
    VALUES (e.id, r_start, r_end, r_part, request_form_clean(request->>'note', 1000))
    RETURNING id INTO new_id;
    RETURN jsonb_build_object('id', new_id);
EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;

-- Cancelar um pedido próprio ainda não aprovado.
CREATE OR REPLACE FUNCTION public.ferie_form_cancel(token TEXT, request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
BEGIN
    e := ferie_form_auth(token);
    UPDATE leave_requests SET status = 'cancelled'
     WHERE id = request_id AND employee_id = e.id AND status IN ('pending', 'proposed');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Responder à data sugerida: aceitar vira aprovado nas datas novas; recusar cancela.
CREATE OR REPLACE FUNCTION public.ferie_form_answer(token TEXT, request_id UUID, accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
    r leave_requests;
BEGIN
    e := ferie_form_auth(token);
    SELECT * INTO r FROM leave_requests
     WHERE id = request_id AND employee_id = e.id AND status = 'proposed' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
    END IF;
    IF accept THEN
        UPDATE leave_requests
           SET status = 'approved', start_date = r.proposed_start, end_date = r.proposed_end,
               part = CASE WHEN r.proposed_start = r.proposed_end THEN r.part ELSE 'full' END
         WHERE id = r.id;
    ELSE
        UPDATE leave_requests SET status = 'cancelled' WHERE id = r.id;
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permissões
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.ferie_form_auth(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ferie_blocking_event(public.employees, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ferie_form_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ferie_form_submit(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ferie_form_cancel(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ferie_form_answer(TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ferie_form_data(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ferie_form_submit(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ferie_form_cancel(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ferie_form_answer(TEXT, UUID, BOOLEAN) TO anon, authenticated;

-- ============================================================================
-- Ferie: agenda e furgão pelo link pessoal
--
-- Pelo link (/ferie/<token>) a pessoa também registra viagem de trabalho ou
-- reunião externa (só dela) e reserva um furgão. Entram direto, sem
-- aprovação; o escritório edita ou apaga no menu Ferie. Um furgão já
-- reservado na mesma data é recusado (no mesmo dia, só se os horários se
-- cruzam ou faltam).
--
-- agenda_events.booked_by = quem registrou pelo link (pode cancelar o seu).
-- O link passa a ver as reservas dos furgões (datas, furgão e quem), para
-- saber o que está livre.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.agenda_events
    ADD COLUMN IF NOT EXISTS booked_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;

-- Reserva que bate com outra do mesmo furgão (ignora a própria, ao editar).
CREATE OR REPLACE FUNCTION public.ferie_van_clash(p_van UUID, p_start DATE, p_end DATE, p_t1 TIME, p_t2 TIME, p_ignore UUID)
RETURNS public.agenda_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.* FROM agenda_events a
     WHERE a.kind = 'van' AND a.van_id = p_van AND a.id IS DISTINCT FROM p_ignore
       AND a.start_date <= p_end AND a.end_date >= p_start
       -- num dia só, com horários dos dois lados, só bate se as horas se cruzam
       AND NOT (p_start = p_end AND a.start_date = a.end_date
                AND p_t1 IS NOT NULL AND p_t2 IS NOT NULL AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
                AND (p_t2 <= a.start_time OR p_t1 >= a.end_time))
     ORDER BY a.start_date
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ferie_form_event(token TEXT, request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e       employees;
    r_kind  TEXT := request->>'kind';
    r_title TEXT := request_form_clean(request->>'title', 120);
    r_start DATE := NULLIF(trim(coalesce(request->>'start_date', '')), '')::DATE;
    r_end   DATE := NULLIF(trim(coalesce(request->>'end_date', '')), '')::DATE;
    r_t1    TIME := NULLIF(trim(coalesce(request->>'start_time', '')), '')::TIME;
    r_t2    TIME := NULLIF(trim(coalesce(request->>'end_time', '')), '')::TIME;
    r_van   UUID := NULLIF(trim(coalesce(request->>'van_id', '')), '')::UUID;
    clash   agenda_events;
    recent  INTEGER;
    new_id  UUID;
BEGIN
    e := ferie_form_auth(token);

    SELECT count(*) INTO recent FROM agenda_events
     WHERE booked_by = e.id AND created_at > now() - interval '1 hour';
    IF recent >= 20 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    IF r_kind IS NULL OR r_kind NOT IN ('travel', 'external', 'van') THEN
        RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
    END IF;
    IF r_title IS NULL THEN
        RAISE EXCEPTION 'title required' USING ERRCODE = '22023';
    END IF;
    IF r_start IS NULL OR r_end IS NULL OR r_end < r_start
       OR r_start < current_date OR r_end > current_date + 400 OR r_end - r_start > 60 THEN
        RAISE EXCEPTION 'invalid dates' USING ERRCODE = '22023';
    END IF;
    IF r_t1 IS NOT NULL AND r_t2 IS NOT NULL AND r_start = r_end AND r_t2 <= r_t1 THEN
        RAISE EXCEPTION 'invalid times' USING ERRCODE = '22023';
    END IF;

    IF r_kind = 'van' THEN
        IF r_van IS NULL OR NOT EXISTS (SELECT 1 FROM vans WHERE id = r_van AND active) THEN
            RAISE EXCEPTION 'invalid van' USING ERRCODE = '22023';
        END IF;
        clash := ferie_van_clash(r_van, r_start, r_end, r_t1, r_t2, NULL);
        IF clash.id IS NOT NULL THEN
            RAISE EXCEPTION 'van taken: % (% - %)', clash.title, to_char(clash.start_date, 'DD/MM/YYYY'), to_char(clash.end_date, 'DD/MM/YYYY')
                USING ERRCODE = 'P0001', HINT = 'van_taken';
        END IF;
    END IF;

    INSERT INTO agenda_events (kind, title, start_date, end_date, start_time, end_time, employee_ids, van_id, notes, booked_by)
    VALUES (r_kind, r_title, r_start, r_end, r_t1, r_t2,
            CASE WHEN r_kind = 'van' THEN '{}'::UUID[] ELSE ARRAY[e.id] END,
            CASE WHEN r_kind = 'van' THEN r_van END,
            request_form_clean(request->>'notes', 1000), e.id)
    RETURNING id INTO new_id;
    RETURN jsonb_build_object('id', new_id);
EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;

-- Cancelar um registro próprio que ainda não terminou.
CREATE OR REPLACE FUNCTION public.ferie_form_event_cancel(token TEXT, event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    e employees;
BEGIN
    e := ferie_form_auth(token);
    DELETE FROM agenda_events WHERE id = event_id AND booked_by = e.id AND end_date >= current_date;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

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
        'me', jsonb_build_object('id', e.id, 'name', e.name, 'first_name', e.first_name, 'last_name', e.last_name,
            'primary_sector', e.primary_sector, 'secondary_sector', e.secondary_sector),
        'name_order', COALESCE((SELECT value FROM app_settings WHERE key = 'ferie.name_order'), '"first_last"'::jsonb),
        'sectors', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'sort_order', s.sort_order, 'active', s.active)
                   ORDER BY s.sort_order, s.name)
              FROM sectors s), '[]'::jsonb),
        'requests', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'start_date', r.start_date, 'end_date', r.end_date, 'part', r.part, 'hours', r.hours,
                'note', r.note, 'status', r.status, 'proposed_start', r.proposed_start,
                'proposed_end', r.proposed_end, 'response_note', r.response_note,
                'created_at', r.created_at) ORDER BY r.start_date DESC)
              FROM leave_requests r
             WHERE r.employee_id = e.id AND r.end_date >= current_date - 365), '[]'::jsonb),
        'employees', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'first_name', x.first_name, 'last_name', x.last_name,
                'primary_sector', x.primary_sector, 'secondary_sector', x.secondary_sector) ORDER BY x.name)
              FROM employees x WHERE x.active), '[]'::jsonb),
        'leaves', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'employee_id', r.employee_id, 'start_date', r.start_date,
                'end_date', r.end_date, 'part', r.part, 'hours', r.hours, 'status', r.status))
              FROM leave_requests r JOIN employees x ON x.id = r.employee_id AND x.active
             WHERE r.status IN ('pending', 'approved', 'proposed')
               AND r.start_date <= w_to AND r.end_date >= w_from), '[]'::jsonb),
        'events', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'kind', a.kind, 'title', a.title, 'start_date', a.start_date,
                'end_date', a.end_date, 'start_time', a.start_time, 'end_time', a.end_time,
                'sector', a.sector, 'employee_ids', a.employee_ids, 'van_id', a.van_id,
                'booked_by', a.booked_by, 'mine', a.booked_by = e.id))
              FROM agenda_events a
             WHERE a.start_date <= w_to AND a.end_date >= w_from), '[]'::jsonb),
        'vans', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'plate', v.plate) ORDER BY v.sort_order, v.name)
              FROM vans v WHERE v.active), '[]'::jsonb)
    );
END;
$$;


REVOKE ALL ON FUNCTION public.ferie_van_clash(UUID, DATE, DATE, TIME, TIME, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ferie_form_event(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ferie_form_event_cancel(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ferie_form_event(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ferie_form_event_cancel(TEXT, UUID) TO anon, authenticated;

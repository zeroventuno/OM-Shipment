-- ============================================================================
-- Ferie: ore di permesso
--
-- Um permesso é parte de um dia: manhã ou tarde e quantas horas (ex.: tarde,
-- 2 horas). leave_requests ganha hours, só com part = am/pm, de 0,5 em 0,5,
-- até 8. Sem hours, manhã/tarde continua valendo meio dia, como antes.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS hours NUMERIC(3,1);
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_hours;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_hours
    CHECK (hours IS NULL OR (part <> 'full' AND hours > 0 AND hours <= 8));

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
    r_hours NUMERIC := NULLIF(trim(coalesce(request->>'hours', '')), '')::NUMERIC;
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
    -- horas de permesso: só com manhã ou tarde, de 0,5 em 0,5, até 8
    IF r_hours IS NOT NULL AND (r_part = 'full' OR r_hours <= 0 OR r_hours > 8 OR r_hours * 2 <> trunc(r_hours * 2)) THEN
        RAISE EXCEPTION 'invalid hours' USING ERRCODE = '22023';
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

    INSERT INTO leave_requests (employee_id, start_date, end_date, part, hours, note)
    VALUES (e.id, r_start, r_end, r_part, r_hours, request_form_clean(request->>'note', 1000))
    RETURNING id INTO new_id;
    RETURN jsonb_build_object('id', new_id);
EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
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
                'sector', a.sector, 'employee_ids', a.employee_ids))
              FROM agenda_events a
             WHERE a.kind <> 'van' AND a.start_date <= w_to AND a.end_date >= w_from), '[]'::jsonb)
    );
END;
$$;


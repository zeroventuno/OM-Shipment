-- ============================================================================
-- Ferie: no link pessoal, marcar os colegas que vão junto
--
-- Na trasferta e na reunião externa pelo link pessoal, quem cria pode marcar
-- outros colegas (request.employee_ids). A própria pessoa sempre entra; só
-- funcionários ativos são aceitos, até 50.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

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
    r_people UUID[];
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

    -- trasferta pode levar um furgão (opcional); o furgão é obrigatório só na reserva
    -- quem vai: a própria pessoa e os colegas marcados (só funcionários ativos, até 50)
    IF r_kind <> 'van' THEN
        SELECT array_agg(x.id) INTO r_people FROM (
            SELECT e.id AS id
            UNION
            SELECT em.id FROM employees em
             WHERE em.active AND em.id IN (
                 SELECT (v #>> '{}')::UUID FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(request->'employee_ids') = 'array' THEN request->'employee_ids' ELSE '[]'::jsonb END) v
                 LIMIT 50)
        ) x;
    END IF;

    IF r_kind = 'van' OR (r_kind = 'travel' AND r_van IS NOT NULL) THEN
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
            CASE WHEN r_kind = 'van' THEN '{}'::UUID[] ELSE r_people END,
            CASE WHEN r_kind = 'van' THEN r_van END,
            request_form_clean(request->>'notes', 1000), e.id)
    RETURNING id INTO new_id;

    -- trasferta com furgão: a reserva do furgão entra junto, ligada à trasferta
    IF r_kind = 'travel' AND r_van IS NOT NULL THEN
        INSERT INTO agenda_events (kind, title, start_date, end_date, start_time, end_time, van_id, notes, booked_by, parent_id)
        VALUES ('van', r_title, r_start, r_end, r_t1, r_t2, r_van, request_form_clean(request->>'notes', 1000), e.id, new_id);
    END IF;
    RETURN jsonb_build_object('id', new_id);
EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;


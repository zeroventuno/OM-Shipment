-- ============================================================================
-- Ferie: nome e sobrenome separados, e a ordem em que aparecem
--
-- employees ganha first_name e last_name. A coluna name continua (é o que já
-- estava cadastrado e o que a busca usa); ao salvar pela tela, ela vira
-- "Nome Sobrenome". Quem foi cadastrado antes fica como está até alguém abrir
-- a ficha e separar os dois campos.
--
-- A ordem de exibição ("Nome Cognome" ou "Cognome Nome", mais comum na
-- Itália) fica em app_settings, chave ferie.name_order, e vale para todos,
-- inclusive no link pessoal.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS last_name TEXT;

CREATE TABLE IF NOT EXISTS public.app_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_settings IS 'Preferências do Gestionale que valem para todos (chave → valor).';
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_authenticated_full_access" ON public.app_settings;
CREATE POLICY "app_settings_authenticated_full_access" ON public.app_settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.app_settings FROM anon;

INSERT INTO public.app_settings (key, value) VALUES ('ferie.name_order', '"first_last"')
ON CONFLICT (key) DO NOTHING;

-- O link pessoal recebe nome, sobrenome e a ordem.
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
                'id', r.id, 'start_date', r.start_date, 'end_date', r.end_date, 'part', r.part,
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
                'end_date', r.end_date, 'part', r.part, 'status', r.status))
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

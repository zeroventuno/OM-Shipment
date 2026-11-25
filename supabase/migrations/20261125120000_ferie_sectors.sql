-- ============================================================================
-- Ferie: setores configuráveis
--
-- Os setores eram uma lista fixa no código. Passam para a tabela sectors,
-- editável no menu Ferie › Settori. As chaves antigas continuam as mesmas
-- (officina, amministrazione…), então funcionários e eventos já cadastrados
-- não mudam. Entra o setor Abbigliamento / E-commerce (vestuário).
--
-- Um setor em uso não pode ser apagado (só desativado).
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sectors (
    id         TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{1,40}$'),
    name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sectors IS 'Setores da Officine Mattio para o controle de férias.';

INSERT INTO public.sectors (id, name, sort_order) VALUES
    ('officina', 'Officina', 10),
    ('amministrazione', 'Amministrazione', 20),
    ('magazzino', 'Magazzino', 30),
    ('commerciali', 'Commerciali', 40),
    ('marketing', 'Marketing', 50),
    ('abbigliamento_ecommerce', 'Abbigliamento / E-commerce', 55),
    ('cycling_tour', 'OM Cycling Tour', 60)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sectors_authenticated_full_access" ON public.sectors;
CREATE POLICY "sectors_authenticated_full_access" ON public.sectors
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.sectors FROM anon;

-- A lista fixa sai; no lugar, a ligação com a tabela.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_primary_sector_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_secondary_sector_check;
ALTER TABLE public.agenda_events DROP CONSTRAINT IF EXISTS agenda_events_sector_check;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_primary_sector_fkey;
ALTER TABLE public.employees ADD CONSTRAINT employees_primary_sector_fkey
    FOREIGN KEY (primary_sector) REFERENCES public.sectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_secondary_sector_fkey;
ALTER TABLE public.employees ADD CONSTRAINT employees_secondary_sector_fkey
    FOREIGN KEY (secondary_sector) REFERENCES public.sectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.agenda_events DROP CONSTRAINT IF EXISTS agenda_events_sector_fkey;
ALTER TABLE public.agenda_events ADD CONSTRAINT agenda_events_sector_fkey
    FOREIGN KEY (sector) REFERENCES public.sectors(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- O link pessoal recebe também os setores (nome e ordem).
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
            SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name,
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

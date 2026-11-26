-- ============================================================================
-- Controllo di entrata: a bike que chega numa caixa (garantia, assistência,
-- retirada numa loja), registrada como no papel que o Cristiano usava:
-- cliente, modelo, número de série, caixa danificada, agente, motivo,
-- componentes de como ela está montada, o que veio na caixa, observações e o
-- mapa dos defeitos (as mesmas marcas do Rentaloop: x/y em % sobre o desenho).
--
-- Código OME-AA-NNN (E de entrata), gerado no banco como OMW/OMA/OMP.
-- Pode ficar ligado a uma assistência (OMA), uma garantia (OMW) e/ou a uma
-- retirada (envio is_pickup), ou a nada.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entry_checks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT UNIQUE,
    arrival_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
    customer_id   UUID REFERENCES public.customers (id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 200),
    agent         TEXT,
    bike_model    TEXT,
    serial_number TEXT,
    size          TEXT,
    box_damaged   BOOLEAN NOT NULL DEFAULT false,
    reason        TEXT,
    -- {"groupset": "Campy SR Wireless", "cranks": "172,5 48/32", ...}
    components    JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(components) = 'object'),
    -- o que veio na caixa: {"wheels": false, "cassette": false, "saddle": true, ...}
    contents      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contents) = 'object'),
    -- [{"id","x","y","kind","side","note"}]
    marks         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(marks) = 'array' AND jsonb_array_length(marks) <= 20),
    notes         TEXT,
    ticket_id     VARCHAR REFERENCES public.tickets (id) ON DELETE SET NULL,
    warranty_id   VARCHAR REFERENCES public.warranties (id) ON DELETE SET NULL,
    shipment_id   UUID REFERENCES public.shipments (id) ON DELETE SET NULL,
    created_by    UUID DEFAULT auth.uid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.entry_checks IS 'Controllo di entrata (OME-AA-NNN): bike que chega na caixa, com o mapa dos defeitos.';

CREATE INDEX IF NOT EXISTS entry_checks_ticket_idx   ON public.entry_checks (ticket_id);
CREATE INDEX IF NOT EXISTS entry_checks_warranty_idx ON public.entry_checks (warranty_id);
CREATE INDEX IF NOT EXISTS entry_checks_customer_idx ON public.entry_checks (customer_id);

CREATE OR REPLACE FUNCTION public.set_entry_check_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    yy TEXT := to_char(now() AT TIME ZONE 'Europe/Rome', 'YY');
    next_number INTEGER;
BEGIN
    IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('entry_checks.code'));
    SELECT COALESCE(MAX((regexp_match(code, '^OME-' || yy || '-(\d+)$'))[1]::INTEGER), 0) + 1
      INTO next_number FROM entry_checks;
    NEW.code := 'OME-' || yy || '-' || lpad(next_number::TEXT, 3, '0');
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_entry_check_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS entry_checks_set_code ON public.entry_checks;
CREATE TRIGGER entry_checks_set_code BEFORE INSERT ON public.entry_checks
    FOR EACH ROW EXECUTE FUNCTION public.set_entry_check_code();

CREATE OR REPLACE FUNCTION public.entry_checks_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    NEW.code := OLD.code;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.entry_checks_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS entry_checks_touch ON public.entry_checks;
CREATE TRIGGER entry_checks_touch BEFORE UPDATE ON public.entry_checks
    FOR EACH ROW EXECUTE FUNCTION public.entry_checks_touch();

ALTER TABLE public.entry_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entry_checks FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_checks TO authenticated;
DROP POLICY IF EXISTS "entry_checks_authenticated_full_access" ON public.entry_checks;
CREATE POLICY "entry_checks_authenticated_full_access" ON public.entry_checks
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

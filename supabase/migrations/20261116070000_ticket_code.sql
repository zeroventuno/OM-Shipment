-- ============================================================================
-- Protocolo interno das assistências: OMA-AA-NNN (como o OMW-AA-NNN das garantias)
--
-- tickets.protocol_number continua sendo o protocolo do FABRICANTE (Shimano,
-- SRAM…). O código interno fica em tickets.code e é a referência que vai nos
-- envios. As assistências existentes são numeradas da mais antiga para a mais
-- nova (AA = ano de abertura); as novas recebem o próximo número.
-- ============================================================================

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS code TEXT;

-- Numerar não é "alterar" a assistência: mantém o updated_at de cada uma.
ALTER TABLE public.tickets DISABLE TRIGGER tickets_touch;

WITH ordered AS (
    SELECT id, created_at, row_number() OVER (ORDER BY created_at, id) AS n
    FROM public.tickets
    WHERE code IS NULL
)
UPDATE public.tickets t
SET code = 'OMA-' || to_char(o.created_at AT TIME ZONE 'Europe/Rome', 'YY') || '-' || lpad(o.n::TEXT, 3, '0')
FROM ordered o
WHERE t.id = o.id;

ALTER TABLE public.tickets ENABLE TRIGGER tickets_touch;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_code_unique ON public.tickets (code);
COMMENT ON COLUMN public.tickets.code IS 'Protocolo interno OMA-AA-NNN (referência dos envios). protocol_number = protocolo do fabricante.';

CREATE OR REPLACE FUNCTION public.set_ticket_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('tickets.code'));

    SELECT COALESCE(MAX((regexp_match(code, '^OMA-\d{2}-(\d+)$'))[1]::INTEGER), 0) + 1
      INTO next_number
      FROM public.tickets;

    NEW.code := 'OMA-' || to_char(now() AT TIME ZONE 'Europe/Rome', 'YY') || '-' || lpad(next_number::TEXT, 3, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_set_code ON public.tickets;
CREATE TRIGGER tickets_set_code
    BEFORE INSERT ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_ticket_code();

-- API dos parceiros: o código interno passa a sair junto.
CREATE OR REPLACE FUNCTION public.partner_ticket_json(t public.tickets, with_history BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', t.id,
        'code', t.code,
        'phase', t.phase,
        'approval_status', t.approval_status,
        'customer_name', t.client_name,
        'component', t.component,
        'brand', t.brand,
        'serial_number', t.serial_number,
        'producer_protocol', t.protocol_number,
        'problem', t.problem,
        'shipping', CASE WHEN t.shipping_date IS NULL AND t.tracking_number IS NULL THEN NULL ELSE jsonb_build_object(
            'date', t.shipping_date, 'carrier', t.shipping_company,
            'tracking_code', t.tracking_number, 'cost', t.shipping_cost, 'shipment_id', t.shipment_id) END,
        'completion_date', t.completion_date,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) || CASE WHEN with_history THEN jsonb_build_object('history', COALESCE(t.history, '[]'::jsonb)) ELSE '{}'::jsonb END;
$$;

-- ============================================================================
-- Envios ligados a Assistências e Garantias
--
-- 1. shipments ganha:
--      ticket_id / warranty_id  → a assistência ou garantia que o envio leva
--      service_level            → 'standard' ou 'express'
--      agent                    → agente comercial ligado ao envio
-- 2. tickets e warranties ganham os dados do último envio (data, transportadora,
--    rastreio, custo e o id do envio). As assistências já tinham data,
--    transportadora e rastreio; faltava o custo.
-- 3. Um trigger em shipments copia esses dados para a assistência/garantia
--    ligada sempre que o envio é criado ou alterado, e registra no histórico.
--    Fica no banco (e não no app) para valer também para envios gravados pela
--    API de parceiros.
-- 4. updated_at automático nas três tabelas (base do "o que mudou desde…"
--    da API de parceiros).
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS ticket_id     VARCHAR REFERENCES public.tickets(id)    ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS warranty_id   VARCHAR REFERENCES public.warranties(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_level TEXT NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS agent         TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipments_service_level_check') THEN
        ALTER TABLE public.shipments
            ADD CONSTRAINT shipments_service_level_check CHECK (service_level IN ('standard', 'express'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipments_single_link_check') THEN
        -- Um envio leva uma assistência OU uma garantia, nunca as duas.
        ALTER TABLE public.shipments
            ADD CONSTRAINT shipments_single_link_check CHECK (ticket_id IS NULL OR warranty_id IS NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS shipments_ticket_id_idx   ON public.shipments (ticket_id)   WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipments_warranty_id_idx ON public.shipments (warranty_id) WHERE warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipments_order_id_idx    ON public.shipments (order_id);

COMMENT ON COLUMN public.shipments.service_level IS 'standard ou express (express custa mais).';
COMMENT ON COLUMN public.shipments.agent IS 'Agente comercial ligado ao envio.';

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC,
    ADD COLUMN IF NOT EXISTS shipment_id   UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.warranties
    ADD COLUMN IF NOT EXISTS shipping_date    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS shipping_company TEXT,
    ADD COLUMN IF NOT EXISTS tracking_number  TEXT,
    ADD COLUMN IF NOT EXISTS shipping_cost    NUMERIC,
    ADD COLUMN IF NOT EXISTS shipment_id      UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. updated_at automático
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_touch    ON public.tickets;
DROP TRIGGER IF EXISTS warranties_touch ON public.warranties;
DROP TRIGGER IF EXISTS shipments_touch  ON public.shipments;
CREATE TRIGGER tickets_touch    BEFORE UPDATE ON public.tickets    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER warranties_touch BEFORE UPDATE ON public.warranties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER shipments_touch  BEFORE INSERT OR UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Envio → assistência / garantia
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_shipment_to_process()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    carrier   TEXT    := NULLIF(trim(concat_ws(' / ', NEW.selected_quote->>'portal', NEW.selected_quote->>'carrier')), '');
    cost      NUMERIC := NULLIF(NEW.selected_quote->>'price', '')::NUMERIC;
    ship_date TIMESTAMPTZ := COALESCE(NEW.created_at, now());
    summary   TEXT;
    entry     JSONB;
    old_phase TEXT;
BEGIN
    -- Só age quando há vínculo e algo relevante mudou.
    IF NEW.ticket_id IS NULL AND NEW.warranty_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.ticket_id IS NOT DISTINCT FROM OLD.ticket_id
       AND NEW.warranty_id IS NOT DISTINCT FROM OLD.warranty_id
       AND NEW.tracking_code IS NOT DISTINCT FROM OLD.tracking_code
       AND NEW.selected_quote IS NOT DISTINCT FROM OLD.selected_quote THEN
        RETURN NEW;
    END IF;

    summary := concat_ws(' · ',
        to_char(ship_date AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY'),
        carrier,
        NULLIF(NEW.tracking_code, ''),
        CASE WHEN cost IS NOT NULL THEN '€ ' || to_char(cost, 'FM999990.00') END,
        CASE WHEN NEW.service_level = 'express' THEN 'Express' END);
    entry := jsonb_build_object(
        'field', 'shipment', 'oldValue', '-', 'newValue', summary,
        'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'action', 'updated');

    IF NEW.ticket_id IS NOT NULL THEN
        SELECT phase INTO old_phase FROM tickets WHERE id = NEW.ticket_id;
        UPDATE tickets SET
            shipping_date    = ship_date,
            shipping_company = COALESCE(carrier, shipping_company),
            tracking_number  = COALESCE(NULLIF(NEW.tracking_code, ''), tracking_number),
            shipping_cost    = COALESCE(cost, shipping_cost),
            shipment_id      = NEW.id,
            -- Assistência ainda na entrada passa para "Enviado".
            phase            = CASE WHEN phase = 'Ingresso' THEN 'Spedito' ELSE phase END,
            history = COALESCE(history, '[]'::jsonb) || entry
                || CASE WHEN old_phase = 'Ingresso' THEN jsonb_build_array(jsonb_build_object(
                       'field', 'phase', 'oldValue', 'Ingresso', 'newValue', 'Spedito',
                       'date', entry->>'date', 'action', 'updated')) ELSE '[]'::jsonb END
        WHERE id = NEW.ticket_id;
    END IF;

    IF NEW.warranty_id IS NOT NULL THEN
        UPDATE warranties SET
            shipping_date    = ship_date,
            shipping_company = COALESCE(carrier, shipping_company),
            tracking_number  = COALESCE(NULLIF(NEW.tracking_code, ''), tracking_number),
            shipping_cost    = COALESCE(cost, shipping_cost),
            shipment_id      = NEW.id,
            history = COALESCE(history, '[]'::jsonb) || entry
        WHERE id = NEW.warranty_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_sync_process ON public.shipments;
CREATE TRIGGER shipments_sync_process
    AFTER INSERT OR UPDATE ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION public.sync_shipment_to_process();

-- ============================================================================
-- B2B / B2C nos envios (2026-11-26)
--
-- shipments.channel: 'B2B' (lojas, distribuidores, fornecedores) ou 'B2C'
-- (cliente final do e-commerce). Regra para os antigos e para quando o
-- formulário não escolher: número de ordem que começa por EC ou por 600 com
-- 5 dígitos ou mais = B2C (ex.: EC_#60019, 60034); o resto = B2B.
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS channel TEXT;
DO $$ BEGIN
    ALTER TABLE public.shipments ADD CONSTRAINT shipments_channel_check CHECK (channel IN ('B2B', 'B2C'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.shipments.channel IS 'B2B ou B2C. Sem escolha no formulário: EC… ou 600xx… = B2C, o resto B2B.';

CREATE OR REPLACE FUNCTION public.shipment_channel_guess(p_order TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_order ~* '^\s*EC' OR p_order ~ '^\s*#?600[0-9]{2,}' THEN 'B2C' ELSE 'B2B' END
$$;

CREATE OR REPLACE FUNCTION public.shipments_default_channel()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.channel IS NULL THEN NEW.channel := shipment_channel_guess(NEW.order_id); END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_default_channel ON public.shipments;
CREATE TRIGGER shipments_default_channel BEFORE INSERT OR UPDATE ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION public.shipments_default_channel();

-- Os já feitos, sem disparar os outros gatilhos (updated_at, vínculos).
SET LOCAL session_replication_role = replica;
UPDATE public.shipments SET channel = shipment_channel_guess(order_id) WHERE channel IS NULL;
SET LOCAL session_replication_role = origin;

REVOKE ALL ON FUNCTION public.shipments_default_channel() FROM PUBLIC, anon, authenticated;

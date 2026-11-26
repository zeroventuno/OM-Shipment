-- ============================================================================
-- Listini corrieri (2026-11-26)
--
-- Cada listino de transportadora/portal: o arquivo original (PDF/Excel, no
-- bucket privado rate-cards) e a tabela padrão em JSON (tariff), lida dos
-- PDFs por scripts/rates/*-parse.mjs. O Gestionale usa tariff para comparar
-- preços (src/modules/rates/calc.ts). status: 'active' (já usamos),
-- 'evaluation' (proposta, ainda sem conta) ou 'archived'.
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.carrier_rate_cards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier     TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'evaluation' CHECK (status IN ('active', 'evaluation', 'archived')),
    valid_from  DATE,
    notes       TEXT,
    files       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ path, name, size }] no bucket rate-cards
    tariff      JSONB,                               -- tabela padrão (null = ainda não convertido)
    created_by  UUID DEFAULT auth.uid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.carrier_rate_cards IS 'Listini delle transportadoras: arquivo original + tabela padrão (tariff) para comparar preços.';

CREATE OR REPLACE FUNCTION public.carrier_rate_cards_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS carrier_rate_cards_touch ON public.carrier_rate_cards;
CREATE TRIGGER carrier_rate_cards_touch BEFORE UPDATE ON public.carrier_rate_cards
    FOR EACH ROW EXECUTE FUNCTION public.carrier_rate_cards_touch();

ALTER TABLE public.carrier_rate_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carrier_rate_cards FROM anon;
DROP POLICY IF EXISTS carrier_rate_cards_auth ON public.carrier_rate_cards;
CREATE POLICY carrier_rate_cards_auth ON public.carrier_rate_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Arquivos originais: privado, só quem tem login
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rate-cards', 'rate-cards', false, 20971520,
        ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "rate_cards_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "rate_cards_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "rate_cards_auth_delete" ON storage.objects;
CREATE POLICY "rate_cards_auth_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'rate-cards');
CREATE POLICY "rate_cards_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'rate-cards');
CREATE POLICY "rate_cards_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'rate-cards');

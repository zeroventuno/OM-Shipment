-- ============================================================================
-- Ritiri (envio ao contrário) e proforma de importação numerada (IMP-001…)
--
-- 1. shipments.is_pickup: o envio é um ritiro — a mercadoria vem do cliente
--    para a Officine Mattio. destination_country passa a ser o país de retirada.
-- 2. import_documents: registro das proformas de importação. Quando o ritiro
--    vem de fora da UE, a alfândega exige um documento com o CLIENTE como
--    remetente/exportador e a Officine Mattio como destinatária. Cada documento
--    tem número sequencial único (IMP-001, IMP-002…), dado pelo banco.
-- 3. issue_import_document(doc): grava um documento novo com o próximo número
--    (ou atualiza um existente mantendo o número) e devolve o registro.
-- ============================================================================

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS is_pickup BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.shipments.is_pickup IS 'Ritiro: a mercadoria vem do cliente para a OM; destination_country = país de retirada.';

CREATE TABLE IF NOT EXISTS public.import_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number      INTEGER NOT NULL UNIQUE CHECK (number > 0),
    code        TEXT GENERATED ALWAYS AS ('IMP-' || lpad(number::text, 3, '0')) STORED,
    issued_on   DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
    shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    -- Remetente/exportador (o cliente): {name, address, postal_code, city, country, tax_id, phone, email, contact}
    shipper     JSONB NOT NULL,
    -- Artigos: [{qty, description, hs_code, origin, unit_value}]
    items       JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Caixas: [{width, height, depth, weight}] em cm e kg
    parcels     JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason      TEXT,
    notes       TEXT,
    total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Anulado: o número fica usado, mas o documento não vale
    cancelled   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.import_documents IS 'Proforma de importação dos ritiri extra-UE (cliente = remetente, OM = destinatária), numeradas IMP-NNN.';
CREATE INDEX IF NOT EXISTS import_documents_shipment_idx ON public.import_documents (shipment_id);

ALTER TABLE public.import_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_documents_authenticated_read" ON public.import_documents;
CREATE POLICY "import_documents_authenticated_read" ON public.import_documents
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "import_documents_authenticated_update" ON public.import_documents;
CREATE POLICY "import_documents_authenticated_update" ON public.import_documents
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- Inserção só pela função (o número não pode ser escolhido nem repetido); sem DELETE: anula-se.
REVOKE ALL ON public.import_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.import_documents FROM authenticated;
-- Direto na tabela, a equipe só anula/reativa; editar passa pela função.
GRANT UPDATE (cancelled, updated_at) ON public.import_documents TO authenticated;

-- Frase "mercadoria italiana que volta ao fabricante" no documento (padrão: sim).
ALTER TABLE public.import_documents ADD COLUMN IF NOT EXISTS returned BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.issue_import_document(doc JSONB)
RETURNS public.import_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    d_id   UUID := NULLIF(doc->>'id', '')::UUID;
    r      public.import_documents;
    total  NUMERIC := 0;
    item   JSONB;
BEGIN
    IF jsonb_typeof(doc->'shipper') <> 'object' OR NULLIF(trim(doc->'shipper'->>'name'), '') IS NULL THEN
        RAISE EXCEPTION 'shipper name is required' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(doc->'items', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(doc->'items', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'at least one item' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(doc->'items') LOOP
        total := total + COALESCE(NULLIF(item->>'qty', '')::NUMERIC, 0) * COALESCE(NULLIF(item->>'unit_value', '')::NUMERIC, 0);
    END LOOP;

    IF d_id IS NOT NULL THEN
        UPDATE import_documents SET
            issued_on   = COALESCE(NULLIF(doc->>'issued_on', '')::DATE, issued_on),
            shipment_id = NULLIF(doc->>'shipment_id', '')::UUID,
            customer_id = NULLIF(doc->>'customer_id', '')::UUID,
            shipper     = doc->'shipper',
            items       = doc->'items',
            parcels     = COALESCE(doc->'parcels', '[]'::jsonb),
            reason      = NULLIF(trim(doc->>'reason'), ''),
            notes       = NULLIF(trim(doc->>'notes'), ''),
            returned    = COALESCE((doc->>'returned')::BOOLEAN, true),
            total_value = round(total, 2),
            updated_at  = now()
        WHERE id = d_id
        RETURNING * INTO r;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'document not found' USING ERRCODE = '22023';
        END IF;
        RETURN r;
    END IF;

    -- Um por vez: dois documentos emitidos ao mesmo tempo não pegam o mesmo número.
    LOCK TABLE import_documents IN SHARE ROW EXCLUSIVE MODE;
    INSERT INTO import_documents (number, issued_on, shipment_id, customer_id, shipper, items, parcels, reason, notes, returned, total_value)
    VALUES (
        COALESCE((SELECT max(number) FROM import_documents), 0) + 1,
        COALESCE(NULLIF(doc->>'issued_on', '')::DATE, (now() AT TIME ZONE 'Europe/Rome')::date),
        NULLIF(doc->>'shipment_id', '')::UUID,
        NULLIF(doc->>'customer_id', '')::UUID,
        doc->'shipper',
        doc->'items',
        COALESCE(doc->'parcels', '[]'::jsonb),
        NULLIF(trim(doc->>'reason'), ''),
        NULLIF(trim(doc->>'notes'), ''),
        COALESCE((doc->>'returned')::BOOLEAN, true),
        round(total, 2))
    RETURNING * INTO r;
    RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_import_document(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_import_document(JSONB) TO authenticated;

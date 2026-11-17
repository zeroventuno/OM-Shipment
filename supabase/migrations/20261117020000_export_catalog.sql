-- ============================================================================
-- Catálogo de artigos para exportação (descrição em inglês, HS, origem)
--
-- Base interna para preparar a fatura no gestionale antes de um envio fora
-- da UE. Fonte: "Catalogo di riferimento -- Spedizioni internazionali
-- Officine Mattio" (novembro 2026). Os códigos HS são de referência (6
-- dígitos); verified = false quando o próprio catálogo pede verificação.
-- A equipe logada lê e edita; o formulário aberto (anon) não tem acesso.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_catalog (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 'shipped' = já enviado; 'other' = comum no setor, a confirmar
    section        TEXT NOT NULL DEFAULT 'other' CHECK (section IN ('shipped', 'other')),
    item           TEXT NOT NULL,           -- nome do artigo (italiano)
    description_en TEXT NOT NULL,           -- descrição sugerida para a fatura
    hs_code        TEXT,                    -- código HS de referência
    hs_note        TEXT,                    -- ressalva sobre a classificação
    verified       BOOLEAN NOT NULL DEFAULT false,
    origin         TEXT,                    -- origem a declarar
    sort_order     INTEGER NOT NULL DEFAULT 0,
    active         BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.export_catalog IS 'Artigos de exportação: descrição em inglês, HS de referência (6 dígitos) e origem a declarar.';

ALTER TABLE public.export_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "export_catalog_authenticated_full_access" ON public.export_catalog;
CREATE POLICY "export_catalog_authenticated_full_access" ON public.export_catalog
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.export_catalog FROM anon;

INSERT INTO public.export_catalog (section, item, description_en, hs_code, hs_note, verified, origin, sort_order)
SELECT * FROM (VALUES
    ('shipped', 'Telaio bicicletta in carbonio', 'Carbon fibre bicycle frame, unpainted/painted, for road bicycle', '8714.91', NULL, true, 'Italia, se fabbricato da Officine Mattio in Italia', 10),
    ('shipped', 'Forcella in carbonio', 'Carbon fibre bicycle fork for road bicycle', '8714.91', NULL, true, 'Italia, se fabbricata in Italia; altrimenti paese effettivo', 20),
    ('shipped', 'Frameset (telaio + forcella)', 'Carbon road bicycle frameset, consisting of frame and fork', '8714.91', 'Da verificare per il set', false, 'Paese di origine effettivo dei componenti; valutare origine separata se distinta', 30),
    ('shipped', 'Attacco manubrio', 'Bicycle handlebar stem, [carbon/aluminium alloy]', '8714.99', NULL, true, 'Paese di fabbricazione effettivo', 40),
    ('shipped', 'Manubrio', 'Bicycle handlebar, [carbon/aluminium alloy]', '8714.99', NULL, true, 'Paese di fabbricazione effettivo', 50),
    ('shipped', 'Kit telaio (telaio, forcella, attacco e manubrio)', 'Carbon road bicycle frame kit, comprising frame, fork, stem and handlebar', NULL, 'Classificare ogni riga separatamente; non assumere un unico codice', false, 'Origine da verificare per ciascun componente', 60),
    ('shipped', 'Forcellino cambio', 'Bicycle rear derailleur hanger, replacement part for bicycle frame, made of [aluminium alloy]', '8714.99', NULL, true, 'Paese di fabbricazione effettivo', 70),
    ('shipped', 'Supporto computer/GPS in carbonio', 'Carbon fibre bicycle computer mount, compatible with Garmin-type bicycle computers', '8714.99', 'Indicativo', false, 'Italia se prodotto in Italia; altrimenti paese effettivo', 80),
    ('shipped', 'Borraccia in plastica', 'Plastic bicycle water bottle', '3926.90', 'Classificazione da verificare in base al prodotto', false, 'Italia se prodotta in Italia; altrimenti paese effettivo', 90),
    ('shipped', 'Maglia da ciclismo manica lunga', 'Long-sleeve knitted cycling jersey, 83% polyamide and 17% elastane, with front zip and rear pockets (if applicable)', '6110.30 / 6114.30', 'Da confermare in base alla costruzione', false, 'Italia solo se confezionata in Italia con origine non preferenziale italiana; verificare produzione', 100),
    ('shipped', 'Adesivi / sticker UCI', 'Printed self-adhesive labels/stickers for bicycles', '3919.90', 'Indicativo, se autoadesivi in plastica', false, 'Paese di fabbricazione effettivo', 110),
    ('other', 'Ruota completa per bicicletta', 'Bicycle wheel, [carbon/aluminium] rim, with hub and spokes', '8714.92', 'Cerchi e raggi; ruota completa da verificare', false, 'Paese di fabbricazione effettivo', 200),
    ('other', 'Cerchio per bicicletta', 'Bicycle rim, [carbon/aluminium]', '8714.92', NULL, true, 'Paese di fabbricazione effettivo', 210),
    ('other', 'Raggi per ruota', 'Bicycle wheel spokes', '8714.92', NULL, true, 'Paese di fabbricazione effettivo', 220),
    ('other', 'Mozzo', 'Bicycle hub', '8714.93', NULL, true, 'Paese di fabbricazione effettivo', 230),
    ('other', 'Cambio / deragliatore', 'Bicycle derailleur, front or rear', '8714.99', NULL, true, 'Paese di fabbricazione effettivo', 240),
    ('other', 'Catena', 'Bicycle chain', '7315.11', 'Da verificare', false, 'Paese di fabbricazione effettivo', 250),
    ('other', 'Guarnitura / pedivelle', 'Bicycle crankset / crank arms', '8714.96', 'Da verificare in base al componente', false, 'Paese di fabbricazione effettivo', 260),
    ('other', 'Freni / pinze freno', 'Bicycle brakes and brake parts', '8714.94', NULL, true, 'Paese di fabbricazione effettivo', 270),
    ('other', 'Sella', 'Bicycle saddle', '8714.95', NULL, true, 'Paese di fabbricazione effettivo', 280),
    ('other', 'Pedali', 'Bicycle pedals', '8714.96', 'Da verificare', false, 'Paese di fabbricazione effettivo', 290),
    ('other', 'Reggisella', 'Bicycle seat post', '8714.99', 'Da verificare', false, 'Paese di fabbricazione effettivo', 300),
    ('other', 'Portaborraccia', 'Bicycle bottle cage, [carbon/aluminium/plastic]', '8714.99', 'Da verificare', false, 'Paese di fabbricazione effettivo', 310),
    ('other', 'Nastro manubrio', 'Bicycle handlebar tape, [material]', '3919 / 3926 / 4016', 'Possibili in base al materiale e alla forma', false, 'Paese di fabbricazione effettivo', 320),
    ('other', 'Kit viteria', 'Bicycle hardware / fastening kit, [steel/titanium/aluminium]', '7318', 'Da verificare', false, 'Paese di fabbricazione effettivo', 330),
    ('other', 'Pantaloncini / bib shorts', 'Knitted cycling bib shorts, [fibre composition]', '6114.30', 'O altra voce tessile secondo costruzione', false, 'Paese di confezione/origine effettivo', 340),
    ('other', 'Giacca antivento', 'Cycling wind jacket, [woven/knitted], [fibre composition]', '6202 / 6102 / 6113 / 6114', 'Secondo costruzione', false, 'Paese di confezione/origine effettivo', 350),
    ('other', 'Guanti da ciclismo', 'Cycling gloves, [textile/leather/synthetic]', '6116 / 6216', 'Secondo materiale e costruzione', false, 'Paese di fabbricazione effettivo', 360),
    ('other', 'Casco da ciclismo', 'Bicycle helmet, protective sports headgear', '6506.10', NULL, true, 'Paese di fabbricazione effettivo', 370),
    ('other', 'Computer GPS per bicicletta', 'Bicycle GPS cycling computer, electronic navigation device', '8526.91', 'Da verificare per funzioni e configurazione', false, 'Paese di fabbricazione effettivo', 380),
    ('other', 'Sensore / misuratore di potenza', 'Bicycle power meter sensor, electronic measuring device', '9031 / 9029', 'Possibili secondo funzione', false, 'Paese di fabbricazione effettivo', 390),
    ('other', 'Rullo smart indoor', 'Smart indoor bicycle trainer, electronically controlled', '9506.91', 'Da verificare', false, 'Paese di fabbricazione effettivo', 400)
) AS v(section, item, description_en, hs_code, hs_note, verified, origin, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.export_catalog);

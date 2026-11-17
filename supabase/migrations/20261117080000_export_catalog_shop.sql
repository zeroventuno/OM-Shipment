-- Catálogo de exportação: produtos do e-commerce OM (officinemattio.com/shop)
-- e a relação com os códigos de artigo da fatura do gestionale.
--
-- Os mesmos produtos têm nomes diferentes na loja e na fatura; o que liga os
-- dois é o código do artigo da fatura (ex.: C315C1-L → C315C1, sem o tamanho).
-- Com a relação, a Commercial Invoice puxa nome comercial, descrição em inglês,
-- composição, origem e HS.
--
-- HS: 6 dígitos, todos "a verificar" (verified = false). Peças unissex vão nas
-- posições "femininas" (nota 9 do cap. 61 / nota 8 do cap. 62). Jaquetas e
-- gilet: cap. 62 se tecido plano, cap. 61 se malha — a página não diz.

ALTER TABLE public.export_catalog DROP CONSTRAINT IF EXISTS export_catalog_section_check;
ALTER TABLE public.export_catalog
    ADD CONSTRAINT export_catalog_section_check CHECK (section IN ('shipped', 'other', 'shop'));

ALTER TABLE public.export_catalog
    ADD COLUMN IF NOT EXISTS erp_codes   TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS composition TEXT,
    ADD COLUMN IF NOT EXISTS shop_url    TEXT;

COMMENT ON COLUMN public.export_catalog.erp_codes IS 'Códigos de artigo da fatura do gestionale (sem o sufixo de tamanho) que correspondem a este produto.';
COMMENT ON COLUMN public.export_catalog.composition IS 'Composição do material, como na ficha do produto.';

INSERT INTO public.export_catalog (section, item, description_en, hs_code, hs_note, verified, origin, sort_order, composition, shop_url, erp_codes)
SELECT v.section, v.item, v.description_en, v.hs_code, v.hs_note, false, v.origin, v.sort_order, v.composition, v.shop_url, v.erp_codes
FROM (VALUES
    ('shop', 'OM Winter Jacket (giacca invernale)', 'Cycling winter jacket, 68% polyester, 19% polyurethane, 13% polyamide', '6202.40', 'Unisex → voce donna. 6202.40 se tessuto ortogonale; 6102.30 se a maglia.', 'Italy', 500, '68% poliestere, 19% poliuretano, 13% poliammide', '/p/officine-mattio/om-winter-jacket-om-winter-jacket-nero-om-winter-jacket-xs', '{}'::text[]),
    ('shop', 'OM Calzamaglia (calzamaglia termica con bretelle)', 'Knitted thermal cycling bib tights, 85% polyamide, 15% elastane, with padded insert', '6104.63', 'Unisex → voce donna (pantaloni a maglia, fibre sintetiche).', 'Italy', 510, '85% poliammide, 15% elastan (Super Roubaix)', '/p/officine-mattio/om-calzamaglia-om-calzamaglia-nero-om-calzamaglia-m', '{}'),
    ('shop', 'OM Unica maniche lunghe (maglia manica lunga)', 'Knitted long-sleeve cycling jersey, 83% polyamide, 17% elastane', '6110.30', NULL, 'Italy', 520, '83% poliammide, 17% elastan', '/p/officine-mattio/om-unica-maniche-lunghe-om-unica-maniche-lunghe-beige-om-unica-maniche-lunghe-3xs', '{}'),
    ('shop', 'OM Winter Bibs (pantalone invernale con bretelle)', 'Knitted water-repellent cycling bib trousers, synthetic fibres, with padded insert', '6104.63', 'Composizione non indicata sul sito (tessuto Raintec): confermare fibre.', 'Italy', 530, 'Tessuto Raintec idrorepellente (composizione da confermare)', '/p/officine-mattio/om-winter-bibs-om-winter-bibs-nero-om-winter-bibs-xs', '{}'),
    ('shop', 'OM Windstopper Jacket (giacca antivento)', 'Cycling windproof jacket, synthetic fibres, with membrane', '6202.40', 'Composizione non indicata sul sito. 6202.40 se tessuto ortogonale; 6102.30 se a maglia.', 'Italy', 540, 'Da confermare (membrana antivento, retro termofelpato)', '/p/officine-mattio/om-windstopper-jacket-nero-l', '{}'),
    ('shop', 'OM Giacca Speed (giacca)', 'Cycling jacket, 82% recycled polyamide, 18% recycled elastane, polyurethane membrane', '6102.30', 'Tessuto elasticizzato, probabilmente a maglia; 6202.40 se tessuto ortogonale.', 'Italy', 550, '82% poliammide riciclato, 18% elastan riciclato; membrana poliuretano riciclato', '/p/officine-mattio/om-giacca-speed-om-giacca-speed-senape-om-giacca-speed-3xs', '{}'),
    ('shop', 'OM Occhiali (occhiali sportivi)', 'Sports sunglasses', '9004.10', 'Origine da confermare con il fornitore.', 'Italy', 560, 'Montatura 65% materiali di origine vegetale', '/p/officine-mattio/om-occhiali-nero-grigio', '{}'),
    ('shop', 'Jersey Team OM.CC (maglia manica corta)', 'Knitted short-sleeve cycling jersey, 85% polyester, 15% elastane', '6110.30', NULL, 'Italy', 570, '85% poliestere (microfibra), 15% elastan', '/p/officine-mattio/jersey-team-om-cc-acqua-chiaro-xxs', '{}'),
    ('shop', 'Bib Team OM.CC (salopette)', 'Knitted cycling bib shorts, 80% polyamide, 20% elastane, with padded insert', '6104.63', 'Unisex → voce donna (pantaloncini a maglia, fibre sintetiche).', 'Italy', 580, '80% poliammide, 20% elastan', '/p/officine-mattio/bib-team-om-cc-acqua-chiaro-xxs', '{}'),
    ('shop', 'Body Team OM.CC (body intero)', 'Knitted one-piece cycling skinsuit, 85% polyester, 15% elastane, with padded insert', '6114.30', NULL, 'Italy', 590, '85% poliestere, 15% elastan', '/p/officine-mattio/body-team-om-cc-acqua-scuro-s', '{}'),
    ('shop', 'Jersey manica lunga Team OM.CC (maglia manica lunga)', 'Knitted long-sleeve cycling jersey, 85% polyester, 15% elastane', '6110.30', NULL, 'Italy', 600, '85% poliestere (microfibra), 15% elastan', '/p/officine-mattio/jersey-manica-lunga-team-om-cc-acqua-scuro-s', '{C315C1}'),
    ('shop', 'Felpa Team OM.CC (maglia termica)', 'Knitted thermal long-sleeve cycling jersey, 45% polyamide, 42% polyester, 13% elastane', '6110.30', NULL, 'Italy', 610, '45% poliammide, 42% poliestere, 13% elastan (Super Roubaix)', '/p/officine-mattio/felpa-team-om-cc-acqua-scuro-xxs', '{}'),
    ('shop', 'Gilet Team OM.CC (gilet antivento)', 'Sleeveless cycling wind vest, 100% polyester, windproof membrane', '6202.40', 'Unisex → voce donna. 6202.40 se tessuto ortogonale; 6102.30 se a maglia.', 'Italy', 620, '100% poliestere; membrana Windtex 100% poliestere', '/p/officine-mattio/gilet-team-om-cc-ottanio-s', '{}'),
    ('shop', 'OM Gambale (scaldagambe)', 'Knitted cycling leg warmers, 85% polyamide, 15% elastane', '6117.80', 'Accessorio di abbigliamento a maglia.', 'Italy', 630, '85% poliammide, 15% elastan', '/p/officine-mattio/om-gambale-verde-m', '{M067A}'),
    ('shop', 'OM Manicotto (scaldamuscoli braccia)', 'Knitted cycling arm warmers, 85% polyamide, 15% elastane', '6117.80', 'Accessorio di abbigliamento a maglia.', 'Italy', 640, '85% poliammide, 15% elastan (Super Roubaix)', '/p/officine-mattio/om-manicotto-grigio-xs', '{}'),
    ('shop', 'OM Copriscarpa (copriscarpe)', 'Cycling overshoes, textile shoe covers, 90% polyester, 10% elastane, polyurethane membrane', '6406.90', 'Ghette e articoli simili; alternativa 6117.80.', 'Italy', 650, '90% poliestere, 10% elastan; membrana poliuretano (Windtex)', '/p/officine-mattio/om-copriscarpa-verde-xs', '{}'),
    ('shop', 'OM Borraccia 550 ml', 'Plastic bicycle water bottle, 550 ml, BPA-free', '3924.10', 'Alternativa 3926.90. Origine da confermare con il fornitore.', 'Italy', 660, 'Plastica ed elastomeri; valvola in silicone; tappo in polipropilene', '/p/officine-mattio/om-borraccia-bianco-550ml', '{}')
) AS v(section, item, description_en, hs_code, hs_note, origin, sort_order, composition, shop_url, erp_codes)
WHERE NOT EXISTS (SELECT 1 FROM public.export_catalog e WHERE e.item = v.item);

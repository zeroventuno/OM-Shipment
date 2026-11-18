/** Linhas de artigo dos documentos de alfândega (proforma IMP e Commercial Invoice). */

export const emptyItem = () => ({ qty: '1', description: '', hs_code: '', origin: 'Italy', unit_value: '', code: '', catalog_id: '' });

/** Códigos genéricos do Mexal para artigos fora da UE. */
export const GENERIC_PRODUCT_IDS = ['L8BIKE', 'L8FRAME', 'L8WHEEL', 'L8GROUP', 'L8PARTS'];

/** Sugestões do campo ID do produto: genéricos e códigos ligados ao catálogo. */
export const productIdSuggestions = (catalog = []) => [
    ...new Set([...GENERIC_PRODUCT_IDS, ...catalog.flatMap((c) => c.erp_codes || [])]),
];

const num = (v) => Number(String(v ?? '').trim().replace(',', '.'));

/** Artigos preenchidos, com números. */
export const cleanItems = (items) => items
    .filter((it) => it.description.trim())
    .map((it) => ({
        qty: num(it.qty) || 1, description: it.description.trim(), hs_code: it.hs_code.trim(), origin: it.origin.trim(), unit_value: num(it.unit_value) || 0,
        ...(it.code?.trim() ? { code: it.code.trim() } : {}), ...(it.catalog_id ? { catalog_id: it.catalog_id } : {}),
    }));

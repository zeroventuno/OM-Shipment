/**
 * Caixas (colli) de um envio. No banco: [{ width, height, depth, weight, name? }]
 * em cm e kg. Na tela as medidas são texto, para aceitar vírgula ("50,5").
 */

const num = (v) => Number(String(v ?? '').trim().replace(',', '.'));
const toStr = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/** Do banco para as linhas editáveis. */
export const toBoxRows = (parcels) => (parcels || []).map((p) => ({
    width: toStr(p.width), height: toStr(p.height), depth: toStr(p.depth), weight: toStr(p.weight), name: p.name || '',
}));

/** Das linhas para o banco: só as caixas com as quatro medidas maiores que zero. */
export const cleanBoxRows = (rows) => (rows || [])
    .filter((b) => [b.width, b.height, b.depth, b.weight].every((v) => num(v) > 0))
    .map((b) => ({ width: num(b.width), height: num(b.height), depth: num(b.depth), weight: num(b.weight), ...(b.name ? { name: b.name } : {}) }));

/** Caixa padrão escolhida na lista: medidas e peso médio já preenchidos. */
export const rowFromPreset = (p) => ({
    width: toStr(p.width), height: toStr(p.height), depth: toStr(p.depth), weight: toStr(p.avg_weight ?? ''), name: p.name || '',
});

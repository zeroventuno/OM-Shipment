/** Tira acentos e caixa para a busca ("Forcella" = "forcella", "caramañola" = "caramanola"). */
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Filtra o catálogo pelo texto digitado. Cada palavra precisa aparecer em
 * algum campo (artigo, descrição, HS, nota ou origem). O HS ignora os pontos,
 * então "871491" encontra "8714.91".
 */
export function filterCatalog(rows, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((r) => {
        const hay = fold([r.item, r.description_en, r.hs_code, String(r.hs_code || '').replace(/\./g, ''), r.hs_note, r.origin].join(' '));
        return words.every((w) => hay.includes(w));
    });
}

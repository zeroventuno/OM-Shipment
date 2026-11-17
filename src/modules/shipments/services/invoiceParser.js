/**
 * Lê as linhas de texto da fatura do gestionale (layout "INVOICE" da
 * Officine Mattio) e devolve número, data, artigos e frete. Função pura: quem
 * extrai o texto do PDF passa as linhas já montadas (uma por altura na página).
 *
 * Linha de artigo:  C315C1-L  PARENTINI - OM AUTUMN LS JERSEY TEAM - L  PZ 1,00 40,98 40,98 N08,1
 * Linha HS logo abaixo do artigo:  HTS CODE 62031200
 * Frete:  SPEDIZIONE-EXTRAUE SHIPPING COSTS PZ 1,00 25,99 25,99 N08,1
 */

// "1.234,56" → 1234.56
export const itNumber = (s) => Number(String(s || '').replace(/\./g, '').replace(',', '.')) || 0;

const UNITS = 'PZ|PZ\\.|NR|N\\.|PC|PCS|KG|CP|PA|PAIA|SET|KIT|CF|MT';
const ITEM_RE = new RegExp(
    `^(\\S+)\\s+(.+?)\\s+(?:${UNITS})\\s+(\\d+(?:[.,]\\d+)?)\\s+([\\d.]*\\d,\\d{2,4})\\s+(?:(\\d+(?:[.,]\\d+)?%?(?:\\+\\d+(?:[.,]\\d+)?%?)*)\\s+)?([\\d.]*\\d,\\d{2})(?:\\s+\\S+)?$`,
    'i',
);
const HS_RE = /\b(?:HTS|HS)\s*(?:CODE)?\s*[:.]?\s*(\d[\d.\s]{4,13}\d)/i;
const FREIGHT_RE = /SPEDIZ|TRASPORT|SHIPPING|FREIGHT|CARRIAGE/i;

export function parseInvoiceText(lines) {
    const out = { number: '', date: '', items: [], freight: 0 };
    let last = null;
    for (const raw of lines) {
        const line = String(raw).replace(/\s+/g, ' ').trim();
        if (!line) continue;

        // "1/1356 17/11/2026" → nº 1356, data 2026-11-17
        if (!out.number) {
            const m = /\b\d{1,3}\/(\d{1,6})\s+(\d{2})\/(\d{2})\/(\d{4})\b/.exec(line);
            if (m) {
                out.number = m[1];
                out.date = `${m[4]}-${m[3]}-${m[2]}`;
                continue;
            }
        }

        const it = ITEM_RE.exec(line);
        if (it) {
            const [, code, description, qty, unit, , amount] = it;
            if (FREIGHT_RE.test(code) || FREIGHT_RE.test(description)) {
                out.freight += itNumber(amount);
                last = null;
                continue;
            }
            const q = itNumber(qty) || 1;
            last = {
                code,
                description: description.trim(),
                qty: q,
                // valor unitário líquido (com desconto), para o total bater com a fatura
                unit_value: Math.round((itNumber(amount) / q) * 100) / 100,
                list_price: itNumber(unit),
                hs_code: '',
            };
            out.items.push(last);
            continue;
        }

        const hs = HS_RE.exec(line);
        if (hs && last && !last.hs_code) {
            last.hs_code = hs[1].replace(/[\s.]/g, '');
        }
    }
    return out;
}

/**
 * Artigo da fatura → linha do catálogo (descrição em inglês e HS), por
 * palavras-chave em italiano e inglês. null quando nada bate.
 */
const KEYWORDS = [
    [/\b(JERSEY|MAGLI[AE])\b/i, /maglia/i],
    [/\b(BIB|SALOPETT|PANTALONCIN|SHORTS?)\b/i, /pantaloncini|bib/i],
    [/\b(JACKET|GIACC|GILET|VEST|ANTIVENTO|WIND)\b/i, /giacca/i],
    [/\b(GLOVES?|GUANT)/i, /guanti/i],
    [/\b(HELMET|CASCO)\b/i, /casco/i],
    [/\b(BOTTLE|BORRACC)/i, /borraccia/i],
    [/\b(FRAME ?SET|FRAMESET)\b/i, /frameset/i],
    [/\b(FRAME ?KIT|KIT TELAIO)\b/i, /kit telaio/i],
    [/\b(FRAME|TELAIO)\b/i, /^telaio/i],
    [/\b(FORK|FORCELLA)\b/i, /^forcella/i],
    [/\b(STEM|ATTACCO)\b/i, /attacco/i],
    [/\b(HANDLEBAR|MANUBRIO)\b/i, /^manubrio/i],
    [/\b(HANGER|FORCELLINO)\b/i, /forcellino/i],
    [/\b(WHEELS?|RUOT[AE])\b/i, /ruota/i],
    [/\b(SADDLE|SELLA)\b/i, /sella/i],
    [/\b(SEAT ?POST|REGGISELLA)\b/i, /reggisella/i],
    [/\b(TAPE|NASTRO)\b/i, /nastro/i],
];

// Tamanhos no fim do código do artigo: "C315C1-L" → "C315C1".
const SIZE_SUFFIX = /-(?:\d?X{0,3}[SML]|X{1,3}L|\d{1,2}|TU|UNI)$/i;

/** Código da fatura sem o tamanho, para gravar a relação com o produto. */
export const codeBase = (code) => String(code || '').trim().toUpperCase().replace(SIZE_SUFFIX, '');

/** Produto do catálogo ligado a este código da fatura (o mais específico). */
export function matchByCode(code, catalog) {
    const c = codeBase(code);
    if (!c) return null;
    let best = null;
    for (const row of catalog) {
        for (const e of row.erp_codes || []) {
            const k = String(e).toUpperCase();
            if (k && c.startsWith(k) && (!best || k.length > best.len)) best = { row, len: k.length };
        }
    }
    return best?.row || null;
}

// Palavras que identificam o produto ("LS" na fatura = "manica lunga" na loja).
const STOP = new Set(['OM', 'OMCC', 'CC', 'TEAM', 'THE', 'CON', 'PER', 'DA', 'DI']);
const words = (s) => String(s || '').toUpperCase()
    .replace(/\bLS\b/g, 'MANICA LUNGA').replace(/\bSS\b/g, 'MANICA CORTA')
    .replace(/\bMANICHE\b/g, 'MANICA').replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * Artigo da fatura → produto do catálogo: 1º pelo código da fatura já
 * relacionado; 2º pelos nomes dos produtos da loja; 3º por palavras-chave.
 */
export function matchCatalog(description, catalog, code) {
    const byCode = matchByCode(code, catalog);
    if (byCode) return byCode;

    const inv = new Set(words(description));
    let best = null;
    for (const row of catalog.filter((r) => r.section === 'shop')) {
        const w = words(row.item);
        const hits = w.filter((x) => inv.has(x)).length;
        // empate: o que tem menos palavras sobrando é o mais exato
        const score = hits * 10 - (w.length - hits);
        if (hits > 0 && (!best || score > best.score)) best = { row, score };
    }
    if (best) return best.row;

    for (const [inv2, cat] of KEYWORDS) {
        if (!inv2.test(description)) continue;
        const hit = catalog.find((c) => cat.test(c.item));
        if (hit) return hit;
    }
    return null;
}

/** Primeiro código de um campo como "6110.30 / 6114.30" → "6110.30" */
export const firstHs = (hs) => String(hs || '').split('/')[0].trim();

/** Nome comercial do produto: "Jersey Team OM.CC (maglia manica corta)" → "Jersey Team OM.CC" */
export const commercialName = (item) => String(item || '').replace(/\s*\(.*\)\s*$/, '').trim();

/** Campos da linha da Commercial Invoice a partir do produto do catálogo. */
export function itemFromCatalog(row) {
    const name = row.section === 'shop' ? commercialName(row.item) : '';
    return {
        catalog_id: row.id,
        description: [row.description_en || row.item, name && `"${name}"`].filter(Boolean).join(' — '),
        hs_code: firstHs(row.hs_code),
        origin: 'Italy',
    };
}

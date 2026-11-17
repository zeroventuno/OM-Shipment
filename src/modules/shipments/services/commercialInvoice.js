import { COMPANY, EU_CODES, itDate, wrap } from './exportDocs';
import { countryCode, countryLabel } from '../data/countries';
import {
    A4, M, W, INK, MUTED, FILL, text, header, parties, infoStrip, table, signatureBlock, footer,
    pdfSafe, shipperLines, itemTotal, itemsTotal, parcelsWeight, money, kg,
} from './importDocs';

/**
 * Commercial Invoice em inglês para a alfândega de um envio de venda fora da
 * UE. Acompanha a fatura fiscal do gestionale (que continua sendo o documento
 * fiscal): mesmos totais, mas com descrição, código HS e origem por artigo e,
 * quando o acordo pede, a declaração de origem preferencial na fatura.
 */

/** Número REX da Officine Mattio (Registered Exporter). Vazio = ainda não informado. */
export const REX_NUMBER = '';

/** Acima deste valor por remessa a declaração de origem precisa do número REX. */
export const REX_THRESHOLD = 6000;

/** Destinos com declaração de origem na fatura (acordo com a UE). */
export function originStatementFor(country) {
    const code = country?.length === 2 ? country.toUpperCase() : countryCode(country);
    return code === 'UK' || code === 'GB' ? 'uk' : null;
}

// Nomes dos países da UE em inglês, italiano e português, para reconhecer a
// origem digitada ("Italy", "Italia", "Itália", "EU").
// Montado na primeira chamada: exportDocs e este módulo se importam mutuamente.
let EU_NAMES = null;
function euNames() {
    if (EU_NAMES) return EU_NAMES;
    EU_NAMES = new Set(['eu', 'ue', 'european union', 'unione europea', 'uniao europeia']);
    for (const lang of ['en', 'it', 'pt']) {
        let dn;
        try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { continue; }
        for (const code of EU_CODES) EU_NAMES.add(norm(dn.of(code)));
    }
    return EU_NAMES;
}
function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^made in\s+/, '').trim();
}

/** A origem digitada é da UE? ("Italy", "Itália", "EU" → true; "Taiwan" → false) */
export function isEuOrigin(origin) {
    const o = norm(origin);
    if (!o) return false;
    if (euNames().has(o)) return true;
    const code = countryCode(origin);
    return !!code && EU_CODES.has(code);
}

/** Texto da declaração de origem (Acordo UE–Reino Unido, anexo ORIG-4). */
export function originStatementText(rex = REX_NUMBER) {
    const ref = rex ? ` (Exporter Reference No ${rex})` : '';
    return `The exporter of the products covered by this document${ref} declares that, except where otherwise clearly indicated, these products are of European Union preferential origin.`;
}

/**
 * inv: { invoiceNumber, invoiceDate, consignee, items, parcels, terms, statement, rex }
 *   consignee: { name, address, postal_code, city, country, tax_id, contact, phone, email }
 *   items: [{ qty, description, hs_code, origin, unit_value }]
 *   statement: 'uk' | null
 * ctx: { pdf, fonts, logo, signature, color } — o mesmo das outras páginas.
 */
export function renderCommercialInvoice(ctx, inv) {
    const { fonts, color } = ctx;
    const page = ctx.pdf.addPage([A4.width, A4.height]);
    const ref = `FT ${inv.invoiceNumber}`;
    let y = header(ctx, page, 'COMMERCIAL INVOICE', ref, inv.invoiceDate, {
        numberLine: `Invoice No. ${inv.invoiceNumber}   ·   Date ${itDate(inv.invoiceDate)}`,
        sub: 'Export from the EU · Customs copy of the tax invoice issued by Officine Mattio',
    });

    const rex = inv.statement ? (inv.rex ?? REX_NUMBER) : '';
    const exporter = [COMPANY.name, ...COMPANY.lines, 'VAT IT03860450042', rex && `REX ${rex}`].filter(Boolean);
    y = parties(ctx, page, y,
        { label: 'SHIPPER / EXPORTER', lines: exporter },
        { label: 'CONSIGNEE', lines: [inv.consignee.name, ...shipperLines(inv.consignee)] });

    const items = inv.items || [];
    const parcels = inv.parcels || [];
    const destination = inv.consignee.country ? countryLabel(inv.consignee.country, 'en') : '—';
    y = infoStrip(ctx, page, y, [
        ['REASON FOR EXPORT', 'Sale'],
        ['COUNTRY OF DESTINATION', destination],
        ['TERMS OF DELIVERY', inv.terms || '—'],
        ['CURRENCY', 'EUR'],
        ['PACKAGES / GROSS WEIGHT', parcels.length ? `${parcels.length} / ${kg(parcelsWeight(parcels))} kg` : '—'],
    ], [0.17, 0.22, 0.19, 0.12, 0.30]);

    // Com declaração de origem, o que não é de origem UE fica marcado (*).
    const marks = !!inv.statement;
    const nonPref = (it) => marks && !isEuOrigin(it.origin);
    const cols = [
        { key: 'qty', label: 'QTY', w: 0.07, align: 'right' },
        { key: 'description', label: 'DESCRIPTION OF GOODS', w: 0.40 },
        { key: 'hs_code', label: 'HS CODE', w: 0.14 },
        { key: 'origin', label: 'ORIGIN', w: 0.13 },
        { key: 'unit_value', label: 'UNIT VALUE', w: 0.12, align: 'right' },
        { key: 'total', label: 'TOTAL EUR', w: 0.14, align: 'right' },
    ];
    const rows = items.map((it) => ({
        qty: kg(it.qty),
        description: `${it.description || ''}${nonPref(it) ? ' (*)' : ''}`,
        hs_code: it.hs_code || '',
        origin: it.origin || '',
        unit_value: money(it.unit_value),
        total: money(itemTotal(it)),
    }));
    // Frete cobrado na fatura: linha à parte, não é mercadoria (sem HS/origem).
    const freight = Number(inv.freight) || 0;
    if (freight > 0) rows.push({ qty: '', description: 'Transport costs (not goods)', hs_code: '—', origin: '—', unit_value: '', total: money(freight) });
    y = table(ctx, page, y, cols, rows, { minRows: 4 });

    const total = itemsTotal(items) + freight;
    page.drawRectangle({ x: M.left + W * 0.62, y: y - 26, width: W * 0.38, height: 26, color: color(FILL), borderColor: color(INK), borderWidth: 0.8 });
    text(ctx, page, 'TOTAL INVOICE VALUE', M.left + W * 0.62 + 8, y - 16.5, { font: fonts.bold, size: 8, ink: MUTED });
    const tv = `EUR ${money(total)}`;
    text(ctx, page, tv, M.left + W - 8 - fonts.bold.widthOfTextAtSize(tv, 12), y - 17.5, { font: fonts.bold, size: 12 });
    y -= 40;

    const para = (s, { font = fonts.regular, size = 8.6 } = {}) => {
        for (const line of wrap(pdfSafe(s), font, size, W)) {
            text(ctx, page, line, M.left, y, { font, size });
            y -= size + 3;
        }
        y -= 5;
    };

    if (inv.statement) {
        // caixa com a declaração de origem
        const body = originStatementText(rex);
        const lines = wrap(pdfSafe(body), fonts.regular, 9, W - 20);
        const extra = items.some(nonPref) ? wrap(pdfSafe('(*) Products marked with an asterisk are not of European Union preferential origin.'), fonts.regular, 8, W - 20) : [];
        const h = 26 + lines.length * 12 + (extra.length ? extra.length * 10.5 + 4 : 0) + 6;
        page.drawRectangle({ x: M.left, y: y - h + 10, width: W, height: h, borderColor: color(INK), borderWidth: 0.8 });
        text(ctx, page, 'STATEMENT ON ORIGIN', M.left + 10, y - 4, { font: fonts.bold, size: 7.5, ink: MUTED });
        let ly = y - 20;
        for (const l of lines) { text(ctx, page, l, M.left + 10, ly, { size: 9 }); ly -= 12; }
        if (extra.length) { ly -= 4; for (const l of extra) { text(ctx, page, l, M.left + 10, ly, { size: 8, ink: MUTED }); ly -= 10.5; } }
        y -= h + 6;
    }

    if (inv.notes) para(inv.notes);
    para('We hereby certify that this invoice shows the actual price of the goods described, that all particulars given are true and correct, and that the totals correspond to our tax invoice of the same number and date.');
    signatureBlock(ctx, page, Math.min(y - 6, 190), inv.invoiceDate);
    footer(ctx, page, `Commercial invoice FT ${inv.invoiceNumber}`, 1, 1);
}

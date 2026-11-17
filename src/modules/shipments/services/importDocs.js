import { COMPANY, itDate, wrap } from './exportDocs';
import { countryLabel } from '../data/countries';

/**
 * Proforma de importação de um ritiro de fora da UE (IMP-NNN).
 *
 * Na volta, a alfândega quer o CLIENTE como remetente/exportador e a Officine
 * Mattio como destinatária/importadora — a proforma do gestionale põe o
 * cliente como destinatário e é recusada. Este documento sai em inglês, com:
 *   pág. 1  Proforma invoice: remetente, destinatário, artigos (HS, origem,
 *           valor), total, declaração e assinatura/carimbo da OM;
 *   pág. 2  Packing list: as caixas com medidas e pesos.
 */

export const IMPORT_REASONS = {
    warranty: 'Return of goods for warranty repair / replacement',
    repair: 'Return of goods for repair',
    return: 'Return of goods (sale returned)',
    sample: 'Return of samples / demo goods',
};

/** 'IMP-' + 3 dígitos */
export const importCode = (n) => `IMP-${String(n).padStart(3, '0')}`;

const num = (v) => {
    const n = Number(String(v ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

export const itemTotal = (it) => num(it.qty) * num(it.unit_value);
export const itemsTotal = (items) => items.reduce((s, it) => s + itemTotal(it), 0);
export const parcelsWeight = (parcels) => parcels.reduce((s, p) => s + num(p.weight), 0);
/** Volume total em m³ */
export const parcelsVolume = (parcels) => parcels.reduce((s, p) => s + (num(p.width) * num(p.height) * num(p.depth)) / 1e6, 0);

// Formato italiano sem depender do Intl do navegador: 3000 → '3.000,00'
const group = (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const money = (v) => { const [i, d] = Math.abs(num(v)).toFixed(2).split('.'); return `${num(v) < 0 ? '-' : ''}${group(i)},${d}`; };
// 10 → '10', 50.5 → '50,5', 1200 → '1.200'
export const kg = (v, dec = 2) => { const [i, d] = String(Number(num(v).toFixed(dec))).split('.'); return d ? `${group(i)},${d}` : group(i); };
const m3 = (v) => { const [i, d] = num(v).toFixed(3).split('.'); return `${group(i)},${d}`; };

// Helvetica (WinAnsi) não tem todas as letras: o que não cabe perde o acento.
const NO_DECOMPOSE = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', ı: 'i', Ħ: 'H', ħ: 'h' };
const WIN_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
export function pdfSafe(text) {
    return Array.from(String(text ?? '')).map((ch) => {
        const c = ch.codePointAt(0);
        if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.has(ch)) return ch;
        if (ch === '\n') return ch;
        if (NO_DECOMPOSE[ch]) return NO_DECOMPOSE[ch];
        const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
        return /^[\x20-\x7e]+$/.test(base) ? base : '?';
    }).join('');
}

/** Linhas de endereço do remetente (cliente). */
export function shipperLines(s, lang = 'en') {
    const country = s.country ? countryLabel(s.country, lang) : '';
    return [
        s.address,
        [s.postal_code, s.city].filter(Boolean).join(' '),
        country && country.toUpperCase(),
        s.tax_id && `VAT / Tax ID: ${s.tax_id}`,
        s.contact && `Contact: ${s.contact}`,
        s.phone && `Phone: ${s.phone}`,
        s.email && `Email: ${s.email}`,
    ].filter((x) => x && String(x).trim());
}

const A4 = { width: 595.28, height: 841.89 };
const M = { left: 40, right: 40, top: 36, bottom: 40 };
const W = A4.width - M.left - M.right;
const INK = [0.1, 0.1, 0.12];
const MUTED = [0.42, 0.42, 0.47];
const LINE = [0.78, 0.78, 0.82];
const FILL = [0.95, 0.95, 0.96];

/**
 * doc: { number, issued_on, shipper, items, parcels, reason, notes, returned }
 * Devolve Uint8Array.
 */
export async function buildImportPdf({ doc: d, logoBytes, signatureBytes }) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const code = importCode(d.number);
    pdf.setTitle(`Proforma invoice ${code}`);
    pdf.setAuthor(COMPANY.name);

    const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
    const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
    const signature = signatureBytes ? await pdf.embedPng(signatureBytes) : null;
    const color = (c) => rgb(c[0], c[1], c[2]);
    const ctx = { pdf, fonts, logo, signature, color };

    // --------------------------------------------------------------- pág. 1
    let page = pdf.addPage([A4.width, A4.height]);
    let y = header(ctx, page, 'PROFORMA INVOICE', code, d.issued_on);
    y = parties(ctx, page, y, d.shipper);

    // faixa de informações
    const items = d.items || [];
    const origins = [...new Set(items.map((it) => (it.origin || '').trim()).filter(Boolean))];
    const info = [
        ['REASON FOR EXPORT', d.reason || '—'],
        ['COUNTRY OF ORIGIN OF GOODS', origins.length ? origins.join(', ') : 'Italy'],
        ['CURRENCY', 'EUR'],
        ['PACKAGES / GROSS WEIGHT', `${(d.parcels || []).length || '—'} / ${(d.parcels || []).length ? `${kg(parcelsWeight(d.parcels))} kg` : '—'}`],
    ];
    y = infoStrip(ctx, page, y, info, [0.4, 0.24, 0.12, 0.24]);

    // tabela de artigos
    const cols = [
        { key: 'qty', label: 'QTY', w: 0.07, align: 'right' },
        { key: 'description', label: 'DESCRIPTION OF GOODS', w: 0.40 },
        { key: 'hs_code', label: 'HS CODE', w: 0.16 },
        { key: 'origin', label: 'ORIGIN', w: 0.11 },
        { key: 'unit_value', label: 'UNIT VALUE', w: 0.12, align: 'right' },
        { key: 'total', label: 'TOTAL EUR', w: 0.14, align: 'right' },
    ];
    const rows = items.map((it) => ({
        qty: kg(it.qty),
        description: it.description || '',
        hs_code: it.hs_code || '',
        origin: it.origin || '',
        unit_value: money(it.unit_value),
        total: money(itemTotal(it)),
    }));
    y = table(ctx, page, y, cols, rows, { minRows: 6 });

    // total
    const total = itemsTotal(items);
    page.drawRectangle({ x: M.left + W * 0.62, y: y - 26, width: W * 0.38, height: 26, color: color(FILL), borderColor: color(INK), borderWidth: 0.8 });
    text(ctx, page, 'TOTAL VALUE', M.left + W * 0.62 + 8, y - 16.5, { font: fonts.bold, size: 8.5, ink: MUTED });
    const tv = `EUR ${money(total)}`;
    text(ctx, page, tv, M.left + W - 8 - fonts.bold.widthOfTextAtSize(tv, 12), y - 17.5, { font: fonts.bold, size: 12 });
    y -= 40;

    // declaração
    const paras = [];
    if (d.returned !== false) {
        paras.push('The goods listed above were manufactured in Italy by Officine Mattio S.r.l., previously exported from the European Union and are now being returned to the manufacturer. Returned goods: value declared for customs purposes only.');
    }
    if (d.notes) paras.push(d.notes);
    paras.push('We hereby certify that this invoice shows the actual value of the goods described, that all particulars given are true and correct, and that the goods originate in the country indicated.');
    for (const p of paras) {
        for (const line of wrap(pdfSafe(p), fonts.regular, 8.6, W)) {
            text(ctx, page, line, M.left, y, { size: 8.6 });
            y -= 11.5;
        }
        y -= 5;
    }
    signatureBlock(ctx, page, Math.min(y - 6, 190), d.issued_on);
    footer(ctx, page, code, 1, 2);

    // --------------------------------------------------------------- pág. 2
    page = pdf.addPage([A4.width, A4.height]);
    y = header(ctx, page, 'PACKING LIST', code, d.issued_on);
    y = parties(ctx, page, y, d.shipper);
    const parcels = d.parcels || [];
    const pcols = [
        { key: 'n', label: 'PACKAGE', w: 0.14 },
        { key: 'type', label: 'TYPE', w: 0.22 },
        { key: 'dims', label: 'DIMENSIONS L × W × H (CM)', w: 0.32 },
        { key: 'vol', label: 'VOLUME (M³)', w: 0.14, align: 'right' },
        { key: 'weight', label: 'GROSS WEIGHT (KG)', w: 0.18, align: 'right' },
    ];
    const prow = parcels.map((p, i) => ({
        n: `${i + 1} / ${parcels.length}`,
        type: p.name || 'Carton box',
        dims: `${kg(p.width)} × ${kg(p.height)} × ${kg(p.depth)}`,
        vol: m3((num(p.width) * num(p.height) * num(p.depth)) / 1e6),
        weight: kg(p.weight),
    }));
    y = table(ctx, page, y, pcols, prow.length ? prow : [{ n: '—', type: 'To be defined', dims: '', vol: '', weight: '' }], { minRows: 4 });
    const sums = [
        ['TOTAL PACKAGES', String(parcels.length || '—')],
        ['TOTAL GROSS WEIGHT', parcels.length ? `${kg(parcelsWeight(parcels))} kg` : '—'],
        ['TOTAL VOLUME', parcels.length ? `${m3(parcelsVolume(parcels))} m³` : '—'],
    ];
    y = infoStrip(ctx, page, y - 4, sums, [0.34, 0.33, 0.33]);
    y -= 4;
    const contents = items.map((it) => `${kg(it.qty)} × ${it.description}`).join('; ');
    if (contents) {
        for (const line of wrap(pdfSafe(`Contents: ${contents}`), fonts.regular, 8.6, W)) {
            text(ctx, page, line, M.left, y, { size: 8.6 });
            y -= 11.5;
        }
    }
    signatureBlock(ctx, page, Math.min(y - 20, 190), d.issued_on);
    footer(ctx, page, code, 2, 2);

    return pdf.save();
}

// ---------------------------------------------------------------------------
// Peças do layout
// ---------------------------------------------------------------------------

function text({ fonts, color }, page, s, x, y, { font = fonts.regular, size = 9, ink = INK } = {}) {
    page.drawText(pdfSafe(s), { x, y, size, font, color: color(ink) });
}

function header(ctx, page, title, code, date) {
    const { fonts, logo, color } = ctx;
    const top = A4.height - M.top;
    if (logo) {
        const w = 170;
        const h = (logo.height / logo.width) * w;
        page.drawImage(logo, { x: M.left, y: top - h, width: w, height: h });
    }
    const tw = fonts.bold.widthOfTextAtSize(title, 20);
    text(ctx, page, title, M.left + W - tw, top - 18, { font: fonts.bold, size: 20 });
    const line = `No. ${code}   ·   Date ${itDate(date)}`;
    text(ctx, page, line, M.left + W - fonts.bold.widthOfTextAtSize(line, 10), top - 36, { font: fonts.bold, size: 10 });
    const sub = 'Import into the EU · Shipper: customer · Consignee: Officine Mattio';
    text(ctx, page, sub, M.left + W - fonts.regular.widthOfTextAtSize(sub, 7.5), top - 49, { size: 7.5, ink: MUTED });
    const y = top - 62;
    page.drawLine({ start: { x: M.left, y }, end: { x: M.left + W, y }, thickness: 1.2, color: color(INK) });
    return y - 12;
}

function parties(ctx, page, y, shipper) {
    const { fonts, color } = ctx;
    const gap = 14;
    const bw = (W - gap) / 2;
    const left = [shipper.name, ...shipperLines(shipper)];
    const right = [COMPANY.name, ...COMPANY.lines, 'VAT IT03860450042'];
    const inner = bw - 20;
    const linesOf = (arr) => arr.flatMap((s, i) => wrap(pdfSafe(s), i === 0 ? fonts.bold : fonts.regular, i === 0 ? 10 : 8.5, inner).map((l) => [l, i === 0]));
    const L = linesOf(left);
    const R = linesOf(right);
    const h = 26 + Math.max(L.length, R.length) * 11 + 8;
    const box = (x, label, lines) => {
        page.drawRectangle({ x, y: y - h, width: bw, height: h, borderColor: color(INK), borderWidth: 0.8 });
        page.drawRectangle({ x, y: y - 16, width: bw, height: 16, color: color(INK) });
        page.drawText(label, { x: x + 10, y: y - 11.5, size: 7.5, font: fonts.bold, color: color([1, 1, 1]) });
        let ly = y - 30;
        for (const [l, bold] of lines) {
            text(ctx, page, l, x + 10, ly, { font: bold ? fonts.bold : fonts.regular, size: bold ? 10 : 8.5 });
            ly -= 11;
        }
    };
    box(M.left, 'SHIPPER / EXPORTER', L);
    box(M.left + bw + gap, 'CONSIGNEE / IMPORTER', R);
    return y - h - 12;
}

function infoStrip(ctx, page, y, cells, widths) {
    const { fonts, color } = ctx;
    const h = 34;
    let x = M.left;
    cells.forEach(([label, value], i) => {
        const w = W * widths[i];
        page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: color(INK), borderWidth: 0.6 });
        text(ctx, page, label, x + 7, y - 11, { font: fonts.bold, size: 6.8, ink: MUTED });
        const v = wrap(pdfSafe(value), fonts.bold, 9, w - 14)[0] || '';
        text(ctx, page, v, x + 7, y - 25, { font: fonts.bold, size: 9 });
        x += w;
    });
    return y - h - 12;
}

function table(ctx, page, y, cols, rows, { minRows = 0 } = {}) {
    const { fonts, color } = ctx;
    const headH = 18;
    page.drawRectangle({ x: M.left, y: y - headH, width: W, height: headH, color: color(FILL), borderColor: color(INK), borderWidth: 0.8 });
    let x = M.left;
    for (const c of cols) {
        const w = W * c.w;
        const tx = c.align === 'right' ? x + w - 6 - fonts.bold.widthOfTextAtSize(c.label, 6.8) : x + 6;
        text(ctx, page, c.label, tx, y - 12, { font: fonts.bold, size: 6.8, ink: MUTED });
        x += w;
    }
    let ry = y - headH;
    const bodyTop = ry;
    const all = [...rows];
    while (all.length < minRows) all.push(null);
    for (const r of all) {
        const cells = cols.map((c) => (r ? wrap(pdfSafe(r[c.key] ?? ''), fonts.regular, 8.6, W * c.w - 12) : ['']));
        const h = Math.max(18, 7 + Math.max(...cells.map((l) => l.length)) * 11);
        x = M.left;
        cols.forEach((c, i) => {
            const w = W * c.w;
            cells[i].forEach((line, k) => {
                const tx = c.align === 'right' ? x + w - 6 - fonts.regular.widthOfTextAtSize(line, 8.6) : x + 6;
                text(ctx, page, line, tx, ry - 12.5 - k * 11, { size: 8.6 });
            });
            x += w;
        });
        ry -= h;
        page.drawLine({ start: { x: M.left, y: ry }, end: { x: M.left + W, y: ry }, thickness: 0.4, color: color(LINE) });
    }
    // bordas e divisórias das colunas
    page.drawRectangle({ x: M.left, y: ry, width: W, height: bodyTop - ry, borderColor: color(INK), borderWidth: 0.8 });
    x = M.left;
    for (const c of cols.slice(0, -1)) {
        x += W * c.w;
        page.drawLine({ start: { x, y: y }, end: { x, y: ry }, thickness: 0.4, color: color(LINE) });
    }
    return ry - 10;
}

function signatureBlock(ctx, page, y, date) {
    const { fonts, color, signature } = ctx;
    const rx = M.left + W * 0.55;
    const lineY = y - 70;
    text(ctx, page, `Place and date: ${COMPANY.place}, ${itDate(date)}`, M.left, lineY + 4, { size: 9 });
    text(ctx, page, 'Signature and stamp', rx, y - 4, { font: fonts.bold, size: 7.5, ink: MUTED });
    text(ctx, page, `${COMPANY.name} — ${COMPANY.legalRep}`, rx, lineY - 11, { size: 7.5, ink: MUTED });
    page.drawLine({ start: { x: rx, y: lineY }, end: { x: M.left + W, y: lineY }, thickness: 0.6, color: color(INK) });
    if (signature) {
        const w = 110;
        page.drawImage(signature, { x: rx + 30, y: lineY - 16, width: w, height: (w * signature.height) / signature.width });
    }
}

function footer(ctx, page, code, n, total) {
    const s = `${COMPANY.name} · Via Renzo Gandolfo 6/A · 12100 Cuneo (CN) · Italy · VAT/EORI IT03860450042`;
    text(ctx, page, s, M.left, M.bottom - 18, { size: 7, ink: MUTED });
    const p = `${code} · ${n}/${total}`;
    text(ctx, page, p, M.left + W - ctx.fonts.regular.widthOfTextAtSize(p, 7), M.bottom - 18, { size: 7, ink: MUTED });
}

import { COMPANY, itDate, todayRome } from './exportDocs';
import { A4, header, parties, buyerParties, infoStrip, packingTable, signatureBlock, footer, shipperLines } from './importDocs';

/**
 * Packing list de um envio da Officine Mattio (remetente = OM, destinatário =
 * cliente), em inglês. Cita o DDT (bolla di scarico) e a fatura quando
 * existem, para o packing list bater com os outros documentos do envio.
 *
 * pl: { date, consignee, buyer, parcels, items, ddt: { number, date } | null,
 *       invoice: { number, date } | null, reference }
 */

const ofDate = (doc) => (doc?.number ? `No. ${doc.number}${doc.date ? ` of ${itDate(doc.date)}` : ''}` : '—');

/** Número que identifica o documento no cabeçalho e no rodapé. */
export function packingCode(pl) {
    if (pl.ddt?.number) return `DDT ${pl.ddt.number}`;
    if (pl.invoice?.number) return `FT ${pl.invoice.number}`;
    return String(pl.reference || '').trim();
}

/** Faixa de referências: DDT, fatura e pedido. */
export function packingRefs(pl) {
    return [
        ['TRANSPORT DOCUMENT (DDT)', ofDate(pl.ddt)],
        ['INVOICE', ofDate(pl.invoice)],
        ['ORDER / REFERENCE', String(pl.reference || '').trim() || '—'],
    ];
}

/** Página do packing list num PDF já aberto. ctx: { pdf, fonts, logo, signature, color } */
export function renderPackingList(ctx, pl) {
    const page = ctx.pdf.addPage([A4.width, A4.height]);
    const code = packingCode(pl);
    const date = pl.date || pl.ddt?.date || pl.invoice?.date || todayRome();
    let y = header(ctx, page, 'PACKING LIST', code, date, {
        numberLine: code ? `${code}   ·   Date ${itDate(date)}` : `Date ${itDate(date)}`,
        sub: pl.buyer?.name ? 'Shipper: Officine Mattio · Consignee: forwarder on behalf of the buyer' : 'Shipper: Officine Mattio · Consignee: customer',
    });
    const consignee = pl.consignee || {};
    y = parties(ctx, page, y,
        { label: 'SHIPPER', lines: [COMPANY.name, ...COMPANY.lines, 'VAT IT03860450042'] },
        { label: pl.buyer?.name ? 'CONSIGNEE / SHIP TO' : 'CONSIGNEE', lines: [consignee.name || '—', ...shipperLines(consignee)] });
    y = buyerParties(ctx, page, y, pl.buyer, consignee);
    y = infoStrip(ctx, page, y, packingRefs(pl), [0.36, 0.32, 0.32]);
    y = packingTable(ctx, page, y, pl.parcels || [], pl.items || []);
    signatureBlock(ctx, page, Math.min(y - 20, 190), date);
    footer(ctx, page, code ? `Packing list ${code}` : 'Packing list', 1, 1);
}

/** Copia as páginas de outro PDF (o DDT) para o documento. */
export async function appendPdf(pdf, bytes) {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach((p) => pdf.addPage(p));
}

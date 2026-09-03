import { storageService } from './storage';
import { countryLabel } from '../data/countries';

const A4 = { width: 595.28, height: 841.89 }; // pontos, retrato
const MARGIN = 48;

/**
 * Monta um PDF com os comprovantes de entrega dos envios recebidos, para
 * arquivamento físico. Cada envio rende uma folha identificada com ordem,
 * cliente, país, transportadora, tracking e datas.
 *
 * Comprovante em imagem entra na mesma folha do cabeçalho. Comprovante em PDF
 * ganha a folha de identificação e, na sequência, as páginas do documento
 * original — assim nada do documento fica coberto.
 *
 * pdf-lib entra por import dinâmico: são ~350 KB que só fazem sentido carregar
 * quando alguém realmente exporta.
 */
export async function buildPodPdf(shipments, { locale = 'pt', labels } = {}) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);

    let included = 0;

    for (const shipment of shipments) {
        for (const path of shipment.podFiles || []) {
            const file = await fetchPod(path);
            const page = doc.addPage([A4.width, A4.height]);
            const bottomOfHeader = drawHeader(page, { shipment, locale, labels, bold, regular, rgb });

            if (file.isPdf) {
                // Documento original vai inteiro depois da folha de identificação.
                await appendPdfPages(doc, file.bytes);
            } else {
                await drawImage(doc, page, file, bottomOfHeader);
            }
            included++;
        }
    }

    if (included === 0) return null;
    return doc.save();
}

async function fetchPod(path) {
    const url = await storageService.getPodUrl(path);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar comprovante (${response.status})`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    const ext = (path.split('.').pop() || '').toLowerCase();
    return { bytes, ext, isPdf: ext === 'pdf' };
}

function drawHeader(page, { shipment, locale, labels, bold, regular, rgb }) {
    const left = MARGIN;
    let y = A4.height - MARGIN;

    page.drawText(labels.title, { x: left, y, size: 18, font: bold, color: rgb(0.15, 0.05, 0.5) });
    y -= 10;

    page.drawLine({
        start: { x: left, y },
        end: { x: A4.width - MARGIN, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.85),
    });
    y -= 26;

    const rows = [
        [labels.order, shipment.orderId || '-'],
        [labels.customer, shipment.customerName || '-'],
        [labels.country, countryLabel(shipment.destinationCountry, locale) || '-'],
        [labels.carrier, shipment.selectedQuote
            ? `${shipment.selectedQuote.portal} / ${shipment.selectedQuote.carrier}`
            : '-'],
        [labels.tracking, shipment.trackingCode || '-'],
        [labels.date, shipment.createdAt ? new Date(shipment.createdAt).toLocaleDateString(locale) : '-'],
        [labels.status, labels.statusValue ? labels.statusValue(shipment.status) : (shipment.status || '-')],
    ];

    for (const [label, value] of rows) {
        page.drawText(`${label}:`, { x: left, y, size: 10, font: bold, color: rgb(0.35, 0.35, 0.4) });
        page.drawText(sanitize(value), { x: left + 110, y, size: 11, font: regular, color: rgb(0, 0, 0) });
        y -= 18;
    }

    y -= 6;
    page.drawLine({
        start: { x: left, y },
        end: { x: A4.width - MARGIN, y },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.9),
    });

    return y - 16;
}

async function drawImage(doc, page, file, topY) {
    let image;
    if (file.ext === 'png') {
        image = await doc.embedPng(file.bytes);
    } else {
        image = await doc.embedJpg(file.bytes);
    }

    const maxWidth = A4.width - MARGIN * 2;
    const maxHeight = topY - MARGIN;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
        x: MARGIN + (maxWidth - width) / 2,
        y: topY - height,
        width,
        height,
    });
}

async function appendPdfPages(doc, bytes) {
    const source = await PDFDocumentLoad(bytes);
    const pages = await doc.copyPages(source, source.getPageIndices());
    pages.forEach(p => doc.addPage(p));
}

async function PDFDocumentLoad(bytes) {
    const { PDFDocument } = await import('pdf-lib');
    // ignoreEncryption: alguns PDFs de transportadora vêm com restrição de
    // impressão, que não impede a leitura das páginas.
    return PDFDocument.load(bytes, { ignoreEncryption: true });
}

// Caracteres que o WinAnsi cobre fora das faixas Latin-1 contínuas: travessões,
// aspas tipográficas, €, ™ e afins. Sem listar estes, um nome com apóstrofo
// curvo sairia com '?' no comprovante.
const WINANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ'
    + '‘’“”•–—˜™š›œžŸ';

const UNSUPPORTED = new RegExp(`[^\\x20-\\x7E\\xA0-\\xFF${WINANSI_EXTRAS}]`, 'g');

/**
 * As fontes padrão do PDF usam WinAnsi, que não cobre todo o Unicode. Sem isso,
 * um nome de cliente com caractere fora da tabela derruba a geração inteira.
 * Troca só o que realmente não é representável.
 */
export function sanitize(value) {
    return String(value ?? '').replace(UNSUPPORTED, '?');
}

/** Dispara o download do PDF montado. */
export function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

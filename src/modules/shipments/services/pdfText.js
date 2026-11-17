/**
 * Texto de um PDF em linhas, na ordem da página (de cima para baixo, e da
 * esquerda para a direita dentro da linha). pdf.js entra por import dinâmico
 * só quando uma fatura é carregada.
 */

/** Junta os pedaços de texto do pdf.js em linhas pela altura na página. */
export function groupTextItems(items, tolerance = 2.5) {
    const rows = [];
    for (const it of items) {
        const s = (it.str || '').trim();
        if (!s) continue;
        const x = it.transform[4];
        const y = it.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
        if (!row) {
            row = { y, parts: [] };
            rows.push(row);
        }
        row.parts.push({ x, s });
    }
    return rows
        .sort((a, b) => b.y - a.y)
        .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
}

let pdfjsPromise;
async function loadPdfjs() {
    if (!pdfjsPromise) {
        pdfjsPromise = Promise.all([
            import('pdfjs-dist/build/pdf.min.mjs'),
            import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]).then(([pdfjs, worker]) => {
            pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
            return pdfjs;
        });
    }
    return pdfjsPromise;
}

/** bytes: Uint8Array do PDF (é copiado: o pdf.js consome o buffer). */
export async function pdfLines(bytes, pdfjs) {
    const lib = pdfjs || (await loadPdfjs());
    const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const { items } = await page.getTextContent();
        lines.push(...groupTextItems(items));
    }
    await doc.destroy();
    return lines;
}

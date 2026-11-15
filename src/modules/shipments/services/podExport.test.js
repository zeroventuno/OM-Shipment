import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// O módulo busca o arquivo por URL assinada; aqui devolvemos os bytes direto.
const mockGetPodUrl = vi.fn();
vi.mock('./storage', () => ({
    storageService: { getPodUrl: (...args) => mockGetPodUrl(...args) }
}));

const { buildPodPdf, sanitize } = await import('./podExport');

// PNG 1x1 válido, o menor possível.
const PNG_1X1 = Uint8Array.from(atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
), c => c.charCodeAt(0));

async function makePdfFixture(pageCount) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) doc.addPage([300, 300]);
    return doc.save();
}

const LABELS = {
    title: 'Comprovante de Entrega', order: 'Ordem', customer: 'Cliente',
    country: 'País', carrier: 'Portal/Transp.', tracking: 'Tracking',
    date: 'Data', status: 'Status',
};

const shipment = (over = {}) => ({
    id: 'x', orderId: 'ORD-1', customerName: 'Cycli.cz',
    destinationCountry: 'Alemanha', trackingCode: 'GE12345678',
    status: 'Delivered', createdAt: '2026-03-01T10:00:00Z',
    selectedQuote: { portal: 'MBE', carrier: 'TNT', price: '50' },
    podFiles: ['pods/a.png'],
    ...over,
});

/** Faz o fetch global devolver estes bytes para qualquer URL. */
function serve(bytes) {
    mockGetPodUrl.mockResolvedValue('https://exemplo/assinada');
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
}

beforeEach(() => {
    mockGetPodUrl.mockReset();
});

describe('buildPodPdf', () => {
    it('devolve null quando nenhum envio tem comprovante', async () => {
        const out = await buildPodPdf([shipment({ podFiles: [] })], { labels: LABELS });
        expect(out).toBeNull();
    });

    it('comprovante em imagem gera uma folha só, com cabeçalho e imagem juntos', async () => {
        serve(PNG_1X1);
        const bytes = await buildPodPdf([shipment()], { locale: 'pt', labels: LABELS });

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(1);
    });

    it('comprovante em PDF vira folha de identificação + páginas do original', async () => {
        serve(await makePdfFixture(2));
        const bytes = await buildPodPdf([shipment({ podFiles: ['pods/a.pdf'] })], { labels: LABELS });

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(3); // 1 de identificação + 2 do documento
    });

    it('junta vários envios num arquivo só', async () => {
        serve(PNG_1X1);
        const bytes = await buildPodPdf(
            [shipment({ id: 'a' }), shipment({ id: 'b' }), shipment({ id: 'c' })],
            { labels: LABELS }
        );

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(3);
    });

    it('um envio com dois comprovantes rende duas folhas', async () => {
        serve(PNG_1X1);
        const bytes = await buildPodPdf(
            [shipment({ podFiles: ['pods/a.png', 'pods/b.png'] })],
            { labels: LABELS }
        );

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(2);
    });

    it('gera um PDF de verdade, não bytes soltos', async () => {
        serve(PNG_1X1);
        const bytes = await buildPodPdf([shipment()], { labels: LABELS });

        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(500);
    });

    it('nome de cliente com acento não derruba a geração', async () => {
        // As fontes padrão do PDF são WinAnsi; sem tratamento, isso lançaria.
        serve(PNG_1X1);
        const bytes = await buildPodPdf(
            [shipment({ customerName: 'Müller & Söhne — Ação', destinationCountry: 'Suíça' })],
            { locale: 'pt', labels: LABELS }
        );

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(1);
    });

    it('envio sem cotação e sem tracking ainda gera a folha', async () => {
        serve(PNG_1X1);
        const bytes = await buildPodPdf(
            [shipment({ selectedQuote: null, trackingCode: '', createdAt: null })],
            { labels: LABELS }
        );

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(1);
    });

    it('propaga o erro quando o download do comprovante falha', async () => {
        mockGetPodUrl.mockResolvedValue('https://exemplo/assinada');
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

        await expect(buildPodPdf([shipment()], { labels: LABELS })).rejects.toThrow(/404/);
    });
});

describe('sanitize', () => {
    it('preserva acentos e cedilha', () => {
        expect(sanitize('Müller & Söhne, Suíça, ação')).toBe('Müller & Söhne, Suíça, ação');
    });

    it('preserva pontuação tipográfica que o PDF suporta', () => {
        expect(sanitize('L’Étape – 2026 — “Grand” €50')).toBe('L’Étape – 2026 — “Grand” €50');
    });

    it('troca por ? só o que a fonte não representa', () => {
        expect(sanitize('北京 bike')).toBe('?? bike');
        expect(sanitize('preço ≠ custo')).toBe('preço ? custo');
    });

    it('lida com vazio, null e número', () => {
        expect(sanitize('')).toBe('');
        expect(sanitize(null)).toBe('');
        expect(sanitize(undefined)).toBe('');
        expect(sanitize(42)).toBe('42');
    });
});

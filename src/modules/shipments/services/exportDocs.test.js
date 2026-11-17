import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib';
import { buildExportPdf, eur1Blocks, enDate, freeExportBlocks, isExtraEu, itDate } from './exportDocs';

async function fakeInvoice(pages = 1) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
    return doc.save();
}

describe('isExtraEu', () => {
    it('separa UE e fora da UE pelo nome gravado ou código', () => {
        expect(isExtraEu('Alemanha')).toBe(false);
        expect(isExtraEu('Itália')).toBe(false);
        expect(isExtraEu('Suíça')).toBe(true);
        expect(isExtraEu('Reino Unido')).toBe(true);
        expect(isExtraEu('UZ')).toBe(true);
        expect(isExtraEu('')).toBe(false);
        expect(isExtraEu('Atlantida')).toBe(false);
    });
});

describe('datas', () => {
    it('formata em italiano e inglês', () => {
        expect(itDate('2026-10-26')).toBe('26/10/2026');
        expect(enDate('2026-11-05')).toBe('5 Nov 2026');
        expect(itDate('')).toBe('');
    });
});

describe('textos', () => {
    it('a declaração cita fatura e data, sem tracking', () => {
        const text = freeExportBlocks({ invoiceNumber: '1255', invoiceDate: '2026-10-26', today: '2026-11-16' })
            .map((b) => b.text || '').join(' ');
        expect(text).toContain('invoice no. 1255 dated 26/10/2026');
        expect(text).not.toMatch(/tracking/i);
        expect(text).toContain('Date: 16 Nov 2026');
        expect(text).not.toContain('Decree 457');
    });
    it('o EUR.1 marca só as caixas escolhidas', () => {
        const checks = eur1Blocks({ invoiceNumber: '1', invoiceDate: '2026-01-02', today: '2026-01-03', origin: 'worked', producer: 'own' })
            .filter((b) => b.type === 'check' && b.checked).map((b) => b.text);
        expect(checks).toHaveLength(3);
        expect(checks[0]).toBe('tutti i prodotti');
        expect(checks[1]).toMatch(/sufficientemente lavorati/);
        expect(checks[2]).toMatch(/propri stabilimenti/);
    });
});

describe('buildExportPdf', () => {
    it('junta a fatura e os documentos gerados num PDF só', async () => {
        const base = { invoiceNumber: '1255', invoiceDate: '2026-10-26', today: '2026-11-16' };
        const without = await PDFDocument.load(await buildExportPdf({ ...base, invoiceBytes: await fakeInvoice(2), includeEur1: false }));
        const withEur1 = await PDFDocument.load(await buildExportPdf({ ...base, invoiceBytes: await fakeInvoice(2), includeEur1: true }));
        expect(without.getPageCount()).toBe(4); // 2 da fatura + 2 da declaração, sem página sobrando
        expect(withEur1.getPageCount()).toBe(without.getPageCount() + 1);
    });
    it('a assinatura entra sem acrescentar páginas', async () => {
        // PNG 1x1 transparente
        const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
        const base = { invoiceNumber: '1255', invoiceDate: '2026-10-26', today: '2026-11-16', includeEur1: true };
        const signed = await PDFDocument.load(await buildExportPdf({ ...base, invoiceBytes: await fakeInvoice(1), signatureBytes: png }));
        expect(signed.getPageCount()).toBe(1 + 2 + 1);
    });
    it('troca a assinatura colada à mão na fatura pela do sistema', async () => {
        const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
        const inv = await PDFDocument.create();
        const page = inv.addPage([595, 842]);
        const stamp = inv.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [173, 300, 244, 380] });
        const link = inv.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10] });
        page.node.set(PDFName.of('Annots'), inv.context.obj([inv.context.register(stamp), inv.context.register(link)]));
        const out = await PDFDocument.load(await buildExportPdf({
            invoiceNumber: '1', invoiceDate: '2026-10-26', today: '2026-11-16', includeEur1: false,
            invoiceBytes: await inv.save(), signatureBytes: png,
        }));
        const annots = out.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
        const types = annots.asArray().map((r) => out.context.lookup(r).get(PDFName.of('Subtype')).toString());
        expect(types).toEqual(['/Link']);
    });
});

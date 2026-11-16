import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
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
    it('a declaração cita fatura, data e tracking', () => {
        const text = freeExportBlocks({ invoiceNumber: '1255', invoiceDate: '2026-10-26', tracking: '1Z123', today: '2026-11-16' })
            .map((b) => b.text || '').join(' ');
        expect(text).toContain('invoice no. 1255 dated 26/10/2026, tracking no. 1Z123');
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
        const base = { invoiceNumber: '1255', invoiceDate: '2026-10-26', tracking: 'X', today: '2026-11-16' };
        const without = await PDFDocument.load(await buildExportPdf({ ...base, invoiceBytes: await fakeInvoice(2), includeEur1: false }));
        const withEur1 = await PDFDocument.load(await buildExportPdf({ ...base, invoiceBytes: await fakeInvoice(2), includeEur1: true }));
        expect(without.getPageCount()).toBeGreaterThanOrEqual(4); // 2 da fatura + declaração
        expect(withEur1.getPageCount()).toBe(without.getPageCount() + 1);
    });
});

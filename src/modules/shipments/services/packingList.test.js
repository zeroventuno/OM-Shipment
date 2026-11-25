import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { packingCode, packingRefs } from './packingList';
import { buildExportPdf } from './exportDocs';

const blank = async (pages = 1) => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
    return doc.save();
};

describe('packing list', () => {
    it('cita o DDT com a série, depois a fatura', () => {
        const pl = { ddt: { number: '2/380', date: '2026-11-20' }, invoice: { number: '1356', date: '2026-11-17' }, reference: 'EC_#60019' };
        expect(packingCode(pl)).toBe('DDT 2/380');
        expect(packingRefs(pl)).toEqual([
            ['TRANSPORT DOCUMENT (DDT)', 'No. 2/380 of 20/11/2026'],
            ['INVOICE', 'No. 1356 of 17/11/2026'],
            ['ORDER / REFERENCE', 'EC_#60019'],
        ]);
        expect(packingCode({ invoice: { number: '1356' } })).toBe('FT 1356');
        expect(packingRefs({})[0][1]).toBe('—');
    });

    it('entra no PDF de exportação só com caixas, e a cópia do DDT só se pedida', async () => {
        const base = { invoiceNumber: '1356', invoiceDate: '2026-11-17', today: '2026-11-23', invoiceBytes: await blank(1), includeEur1: false };
        const packing = { consignee: { name: 'Test Ltd', country: 'GB' }, parcels: [{ width: 120, height: 35, depth: 80, weight: 12 }], ddt: { number: '2/380', date: '2026-11-20' } };
        const pages = async (extra) => (await PDFDocument.load(await buildExportPdf({ ...base, ...extra }))).getPageCount();
        const now = await pages({});
        expect(await pages({ packing: { ...packing, parcels: [] } })).toBe(now);
        expect(await pages({ packing })).toBe(now + 1);
        expect(await pages({ packing, ddtBytes: await blank(1) })).toBe(now + 2);
    });

    it('com despachante, comprador e destino final entram na mesma página', async () => {
        const base = { invoiceNumber: '1411', invoiceDate: '2026-11-25', today: '2026-11-25', invoiceBytes: await blank(1), includeEur1: false };
        const fwd = { name: 'Forwarder Pte Ltd', city: 'Singapore', country: 'SG' };
        const buyer = { name: 'Buyer', city: 'Surabaya', country: 'ID' };
        const goods = [{ qty: 1, description: 'Bicycle parts', hs_code: '87149950', origin: 'Italy', unit_value: 100 }];
        const parcels = [{ width: 56, height: 33, depth: 45, weight: 6 }];
        const pages = async (extra) => (await PDFDocument.load(await buildExportPdf({ ...base, ...extra }))).getPageCount();
        const plain = await pages({ commercial: { consignee: fwd, items: goods, parcels }, packing: { consignee: fwd, parcels, items: goods } });
        const withBuyer = await pages({ commercial: { consignee: fwd, buyer, items: goods, parcels }, packing: { consignee: fwd, buyer, parcels, items: goods } });
        expect(withBuyer).toBe(plain);
    });
});

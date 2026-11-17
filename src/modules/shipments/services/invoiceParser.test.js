import { describe, expect, it } from 'vitest';
import { parseInvoiceText, matchCatalog, firstHs } from './invoiceParser';
import { isEuOrigin, originStatementFor, originStatementText } from './commercialInvoice';

// Linhas como saem da fatura FT 1356 (EC_#60019).
const FT1356 = [
    'INVOICE sclh@me.com00447930336094',
    '1/1356 17/11/2026',
    'Ordine cliente N. 4370 del 17/11/2026',
    'C315C1-L PARENTINI - OM AUTUMN LS JERSEY TEAM - L PZ 1,00 40,98 40,98 N08,1',
    'M067AVERDE OM - GAMBALE TERMICO VERDE - 2025 PZ 1,00 81,15 81,15 N08,1',
    'HTS CODE 62031200',
    'SPEDIZIONE-EXTRAUE SHIPPING COSTS PZ 1,00 25,99 25,99 N08,1',
    '148,12 0,00 148,12',
];

describe('parseInvoiceText', () => {
    it('lê número, data, artigos, HS e frete da fatura 1356', () => {
        const r = parseInvoiceText(FT1356);
        expect(r.number).toBe('1356');
        expect(r.date).toBe('2026-11-17');
        expect(r.freight).toBeCloseTo(25.99);
        expect(r.items).toHaveLength(2);
        expect(r.items[0]).toMatchObject({ code: 'C315C1-L', description: 'PARENTINI - OM AUTUMN LS JERSEY TEAM - L', qty: 1, unit_value: 40.98, hs_code: '' });
        expect(r.items[1]).toMatchObject({ code: 'M067AVERDE', qty: 1, unit_value: 81.15, hs_code: '62031200' });
        const total = r.items.reduce((s, i) => s + i.qty * i.unit_value, 0) + r.freight;
        expect(total).toBeCloseTo(148.12);
    });

    it('usa o valor líquido quando há desconto e milhares com ponto', () => {
        const r = parseInvoiceText(['X1 TELAIO OM ALPE PZ 2,00 1.500,00 10% 2.700,00 N08,1']);
        expect(r.items[0]).toMatchObject({ qty: 2, unit_value: 1350, list_price: 1500 });
    });
});

describe('matchCatalog', () => {
    const catalog = [
        { item: 'Maglia da ciclismo manica lunga', hs_code: '6110.30 / 6114.30' },
        { item: 'Telaio bicicletta in carbonio', hs_code: '8714.91' },
    ];
    it('liga o artigo ao catálogo por palavra-chave', () => {
        expect(matchCatalog('OM AUTUMN LS JERSEY TEAM', catalog)?.item).toMatch(/Maglia/);
        expect(matchCatalog('TELAIO OM ALPE', catalog)?.hs_code).toBe('8714.91');
        expect(matchCatalog('GAMBALE TERMICO', catalog)).toBeNull();
        expect(firstHs('6110.30 / 6114.30')).toBe('6110.30');
    });
});

describe('origem', () => {
    it('reconhece origem UE em várias línguas', () => {
        for (const o of ['Italy', 'Italia', 'Itália', 'EU', 'Made in Italy', 'France']) expect(isEuOrigin(o)).toBe(true);
        for (const o of ['Taiwan', 'China', '', 'USA']) expect(isEuOrigin(o)).toBe(false);
    });
    it('declaração só para o Reino Unido, com REX quando houver', () => {
        expect(originStatementFor('Reino Unido')).toBe('uk');
        expect(originStatementFor('GB')).toBe('uk');
        expect(originStatementFor('Estados Unidos')).toBeNull();
        expect(originStatementText('ITREX123')).toContain('(Exporter Reference No ITREX123)');
        expect(originStatementText('')).not.toContain('Reference');
    });
});

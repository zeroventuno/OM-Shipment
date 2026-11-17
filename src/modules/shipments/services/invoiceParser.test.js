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

describe('relação código da fatura ↔ produto da loja', () => {
    const shop = [
        { id: 'jl', section: 'shop', item: 'Jersey manica lunga Team OM.CC (maglia manica lunga)', description_en: 'Knitted long-sleeve cycling jersey', hs_code: '6110.30', erp_codes: ['C315C1'] },
        { id: 'jc', section: 'shop', item: 'Jersey Team OM.CC (maglia manica corta)', description_en: 'Knitted short-sleeve cycling jersey', hs_code: '6110.30', erp_codes: [] },
        { id: 'ga', section: 'shop', item: 'OM Gambale (scaldagambe)', description_en: 'Knitted cycling leg warmers', hs_code: '6117.80', erp_codes: ['M067A'] },
        { id: 'bt', section: 'shop', item: 'Bib Team OM.CC (salopette)', description_en: 'Knitted cycling bib shorts', hs_code: '6104.63', erp_codes: [] },
    ];
    it('tira o tamanho do código', async () => {
        const { codeBase } = await import('./invoiceParser');
        expect(codeBase('C315C1-L')).toBe('C315C1');
        expect(codeBase('C315C1-XXL')).toBe('C315C1');
        expect(codeBase('C315C1-3XS')).toBe('C315C1');
        expect(codeBase('M067AVERDE')).toBe('M067AVERDE');
    });
    it('acha pelo código já relacionado, inclusive com cor/tamanho', () => {
        expect(matchCatalog('qualquer coisa', shop, 'C315C1-L')?.id).toBe('jl');
        expect(matchCatalog('OM - GAMBALE TERMICO VERDE', shop, 'M067AVERDE')?.id).toBe('ga');
    });
    it('sem código relacionado, acha pelo nome da loja', () => {
        expect(matchCatalog('PARENTINI - OM AUTUMN LS JERSEY TEAM - L', shop, 'X999')?.id).toBe('jl');
        expect(matchCatalog('JERSEY TEAM OM.CC ACQUA', shop, 'X998')?.id).toBe('jc');
        expect(matchCatalog('BIB TEAM OMCC NERO', shop, '')?.id).toBe('bt');
    });
    it('monta a linha com descrição, nome comercial e HS', async () => {
        const { itemFromCatalog } = await import('./invoiceParser');
        expect(itemFromCatalog(shop[2])).toEqual({ catalog_id: 'ga', description: 'Knitted cycling leg warmers — "OM Gambale"', hs_code: '6117.80', origin: 'Italy' });
    });
});

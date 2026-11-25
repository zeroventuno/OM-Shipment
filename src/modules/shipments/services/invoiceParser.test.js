import { describe, expect, it } from 'vitest';
import { parseInvoiceText, matchCatalog, firstHs, orderTypeFromHs } from './invoiceParser';
import { isEuOrigin, originStatementFor, originStatementText } from './commercialInvoice';

// Linhas como saem da fatura FT 1356 (EC_#60019).
const FT1356 = [
    'CUSTOMER',
    'LANGTON HEWER SIMON',
    '29 CANYNGE SQUARE',
    'BS83LB BRISTOL',
    'Nazione: GB',
    'INVOICE sclh@me.com00447930336094',
    '1/1356 17/11/2026',
    'Ordine cliente N. 4370 del 17/11/2026',
    'C315C1-L PARENTINI - OM AUTUMN LS JERSEY TEAM - L PZ 1,00 40,98 40,98 N08,1',
    'M067AVERDE OM - GAMBALE TERMICO VERDE - 2025 PZ 1,00 81,15 81,15 N08,1',
    'HTS CODE 62031200',
    'SPEDIZIONE-EXTRAUE SHIPPING COSTS PZ 1,00 25,99 25,99 N08,1',
    '148,12 0,00 148,12',
    'NOTES TOTALE DOCUMENTO',
    'EC_#60019',
];

describe('parseInvoiceText', () => {
    it('lê número, data, artigos, HS e frete da fatura 1356', () => {
        const r = parseInvoiceText(FT1356);
        expect(r.number).toBe('1356');
        expect(r.date).toBe('2026-11-17');
        expect(r.freight).toBeCloseTo(25.99);
        expect(r.orderRef).toBe('EC_#60019');
        expect(r.customer).toBe('LANGTON HEWER SIMON');
        expect(r.country).toBe('GB');
        expect(r.items).toHaveLength(2);
        expect(r.items[0]).toMatchObject({ code: 'C315C1-L', description: 'PARENTINI - OM AUTUMN LS JERSEY TEAM - L', qty: 1, unit_value: 40.98, hs_code: '' });
        expect(r.items[1]).toMatchObject({ code: 'M067AVERDE', qty: 1, unit_value: 81.15, hs_code: '62031200' });
        const total = r.items.reduce((s, i) => s + i.qty * i.unit_value, 0) + r.freight;
        expect(total).toBeCloseTo(148.12);
    });

    it('variante separada por espaço fica no código (FT 1362)', async () => {
        const { codeBase } = await import('./invoiceParser');
        const r = parseInvoiceText(['O330 C1 PARENTINI - JERSEY ML GOLD 2026 C1 VERDE PZ 1,00 61,48 61,48 N08,1']);
        expect(r.items[0]).toMatchObject({ code: 'O330 C1', description: 'PARENTINI - JERSEY ML GOLD 2026 C1 VERDE', unit_value: 61.48 });
        expect(codeBase('O330 C1')).toBe('O330');
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
    it('ML é manga longa e nunca vira manga curta (FT 1362)', async () => {
        const { matchCatalogInfo } = await import('./invoiceParser');
        const longa = matchCatalogInfo('PARENTINI - JERSEY ML GOLD 2026 C1 VERDE', shop, 'O330 C1');
        expect(longa).toEqual({ row: shop[0], sure: false });
        const curta = matchCatalogInfo('PARENTINI - JERSEY MC GOLD 2026', shop, 'O312 C2');
        expect(curta?.row.id).toBe('jc');
        const semCurta = shop.filter((r) => r.id !== 'jc');
        expect(matchCatalogInfo('JERSEY MANICA CORTA GOLD', semCurta, '')).toBeNull();
    });
    it('só o código já relacionado é certeza; pelo nome é sugestão', async () => {
        const { matchCatalogInfo } = await import('./invoiceParser');
        expect(matchCatalogInfo('qualquer', shop, 'C315C1-L')?.sure).toBe(true);
        expect(matchCatalogInfo('BIB TEAM OMCC NERO', shop, '')?.sure).toBe(false);
    });
    it('usa o nome da fatura, sem o tamanho, para os documentos baterem', async () => {
        const { itemFromCatalog } = await import('./invoiceParser');
        expect(itemFromCatalog(shop[0], 'PARENTINI - JERSEY ML GOLD 2026 C1 VERDE - L').description)
            .toBe('Knitted long-sleeve cycling jersey — "PARENTINI - JERSEY ML GOLD 2026 C1 VERDE"');
    });
    it('avisa HS diferente da fatura e vestuário sem gênero', async () => {
        const { hsDiffers, missingGender } = await import('./invoiceParser');
        expect(hsDiffers('62031200', '6110.30')).toBe(true);
        expect(hsDiffers('611030', '6110.30')).toBe(false);
        expect(hsDiffers('', '6110.30')).toBe(false);
        expect(missingGender({ hs_code: '6110.30', description: 'Knitted cycling jersey' })).toBe(true);
        expect(missingGender({ hs_code: '6110.30', description: "Men's knitted cycling jersey" })).toBe(false);
        expect(missingGender({ hs_code: '8714.91', description: 'Carbon frame' })).toBe(false);
    });
    it('monta a linha com descrição, nome comercial e HS', async () => {
        const { itemFromCatalog } = await import('./invoiceParser');
        expect(itemFromCatalog(shop[2])).toEqual({ catalog_id: 'ga', description: 'Knitted cycling leg warmers — "OM Gambale"', hs_code: '6117.80', origin: 'Italy' });
    });
});

describe('orderTypeFromHs', () => {
    it('deduz o tipo de ordem', () => {
        expect(orderTypeFromHs(['6110.30', '6117.80'])).toBe('Clothing/Accessories');
        expect(orderTypeFromHs(['8714.91'])).toBe('Frame Kit');
        expect(orderTypeFromHs(['8714.99', '8714.92'])).toBe('Components');
        expect(orderTypeFromHs(['6110.30', '8714.99'])).toBeNull();
        expect(orderTypeFromHs(['', ''])).toBeNull();
    });
});

describe('códigos genéricos do Mexal', () => {
    it('L8PARTS, L22FRAME e afins não ligam a um produto', async () => {
        const { isGenericCode, matchByCode, matchCatalogInfo } = await import('./invoiceParser');
        for (const c of ['L8PARTS', 'L22FRAME', 'L8BICI', 'L22WHEELS', 'L8BIKE', 'L8GROUP']) expect(isGenericCode(c)).toBe(true);
        for (const c of ['C315C1-L', 'BI05KM', 'L8FRAMEX', 'OM-BORRACCIA-ELITE']) expect(isGenericCode(c)).toBe(false);
        const catalog = [{ id: 'm', section: 'shipped', item: 'Manubrio', erp_codes: ['L8PARTS'] }, { id: 'c', section: 'other', item: 'Catena', erp_codes: [] }];
        expect(matchByCode('L8PARTS', catalog)).toBeNull();
        // sem a relação falsa, a linha "Catena red" não vira "Manubrio"
        expect(matchCatalogInfo('B2B Catena red', catalog, 'L8PARTS')?.row.id).not.toBe('m');
    });
});

describe('artigo genérico de peças', () => {
    it('linha sem dizer a peça sugere o genérico; a peça conhecida vence', async () => {
        const { matchCatalogInfo } = await import('./invoiceParser');
        const catalog = [
            { id: 'g', section: 'other', item: 'Parti di bicicletta (generico)', hs_code: '87149950 91', erp_codes: [] },
            { id: 'c', section: 'other', item: 'Catena', hs_code: '7315.11', erp_codes: [] },
        ];
        expect(matchCatalogInfo('SPARE BIKE PARTS', catalog, 'L22FRAME')).toEqual({ row: catalog[0], sure: false });
        expect(matchCatalogInfo('B2B Catena red', catalog, 'L8PARTS').row.id).toBe('c');
    });
});

describe('bloco CUSTOMER', () => {
    it('lê endereço, CAP, país, e-mail e telefone', async () => {
        const { parseCustomerBlock } = await import('./invoiceParser');
        const lines = [
            'OFFICINE MATTIO SRL', 'Email : info@officinemattio.com', 'CUSTOMER', 'GUN 2 BIKE SHOP',
            'Jl.Mayjend Sungkono No.108,Kutoanyar', '66215 Jawa Timur', 'Nazione: ID',
            'NUMBER DATE order@gun2bikeshop.com', 'INVOICE +6282320105427', '1/1411 25/11/2026 DESTINATION',
            'VAT NUMBER CUSTOMER CODE', '99999999999 501.00492', 'TRANSPORT REASON ZONE AGENT CODE PAGE',
        ];
        expect(parseCustomerBlock(lines)).toEqual({
            name: 'GUN 2 BIKE SHOP', address: 'Jl.Mayjend Sungkono No.108,Kutoanyar', postal_code: '66215', city: 'Jawa Timur',
            country: 'ID', tax_id: '', phone: '+6282320105427', email: 'order@gun2bikeshop.com',
        });
        const it = parseCustomerBlock(['CUSTOMER', 'ROSSI SRL', 'VIA ROMA 1', '12100 CUNEO CN', 'Nazione: IT', '1/1500 01/12/2026', 'VAT NUMBER', 'IT01234567890 501.1']);
        expect(it).toMatchObject({ address: 'VIA ROMA 1', postal_code: '12100', city: 'CUNEO CN', country: 'IT', tax_id: 'IT01234567890' });
        expect(parseCustomerBlock(['sem bloco'])).toBeNull();
    });
});


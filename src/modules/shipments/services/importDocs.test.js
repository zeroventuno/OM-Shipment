import { describe, expect, it } from 'vitest';
import { importCode, itemsTotal, kg, money, parcelsVolume, parcelsWeight, pdfSafe, shipperLines } from './importDocs';

describe('importDocs', () => {
    it('numera IMP com 3 dígitos', () => {
        expect(importCode(3)).toBe('IMP-003');
        expect(importCode(1234)).toBe('IMP-1234');
    });
    it('formata valores no padrão italiano', () => {
        expect(money(3000)).toBe('3.000,00');
        expect(money('1234567,5')).toBe('1.234.567,50');
        expect(kg(10)).toBe('10');
        expect(kg('50,5')).toBe('50,5');
        expect(kg(1200)).toBe('1.200');
    });
    it('soma artigos, pesos e volume', () => {
        expect(itemsTotal([{ qty: 2, unit_value: '50' }, { qty: '1', unit_value: '0,5' }])).toBe(100.5);
        const boxes = [{ width: 120, height: 35, depth: 80, weight: 10 }, { width: '50,5', height: 10, depth: 10, weight: '2,5' }];
        expect(parcelsWeight(boxes)).toBe(12.5);
        expect(parcelsVolume(boxes)).toBeCloseTo(0.336 + 0.00505, 6);
    });
    it('troca letras que a fonte do PDF não tem', () => {
        expect(pdfSafe('Łódź café € — ok')).toBe('Lódz café € — ok');
        expect(pdfSafe('東京')).toBe('??');
    });
    it('linhas do remetente sem campos vazios', () => {
        expect(shipperLines({ address: '708 Annette St', postal_code: 'M6S 2E2', city: 'Toronto', country: 'CA', tax_id: '', email: 'a@b.ca' }))
            .toEqual(['708 Annette St', 'M6S 2E2 Toronto', 'CANADA', 'Email: a@b.ca']);
    });
});

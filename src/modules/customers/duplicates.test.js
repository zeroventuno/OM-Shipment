import { describe, expect, it } from 'vitest';
import { emailKey, findDuplicateGroups, groupPairs, nameCore, phoneKey, taxKey } from './duplicates';

const c = (id, name, extra = {}) => ({ id, name, phone: null, email: null, tax_id: null, city: null, shipments: 0, tickets: 0, warranties: 0, requests: 0, addresses: 0, ...extra });

describe('chaves', () => {
    it('nome-base sem forma jurídica', () => {
        expect(nameCore('53ONZE SRL')).toBe(nameCore('53onze'));
        expect(nameCore('Lordgun S.r.l.')).toBe('lordgun');
        expect(nameCore('The Wheelhouse Inc.')).toBe(nameCore('THE WHEELHOUSE'));
        expect(nameCore("Bike Passion Sa'rl")).toBe('bikepassion');
        expect(nameCore('Acqua Sant\'Anna SPA')).toBe(nameCore("ACQUA SANT'ANNA"));
    });
    it('telefone, e-mail e P.IVA', () => {
        expect(phoneKey('+39 0171 322329')).toBe(phoneKey('0171322329'));
        expect(phoneKey('+0000000')).toBeNull();
        expect(phoneKey('123')).toBeNull();
        expect(emailKey(' Info@Shop.IT ')).toBe('info@shop.it');
        expect(emailKey('amministrazione@officinemattio.com')).toBeNull();
        expect(taxKey('IT 03860450042')).toBe(taxKey('03860450042'));
        expect(taxKey('000000')).toBeNull();
    });
});

describe('findDuplicateGroups', () => {
    it('agrupa e classifica a confiança', () => {
        const groups = findDuplicateGroups([
            c('a', '53ONZE SRL', { phone: '+3242276609', city: 'Liège' }),
            c('b', '53ONZE', { phone: '+3242276609', city: 'Liege', shipments: 2 }),
            c('c', 'Giovanni Tommassoni', { phone: '333 1234567', city: 'Aosta' }),
            c('d', 'Tommasoni Giovanni', { phone: '3331234567', city: 'Aosta' }),
            c('e', 'Fábio Meira', { phone: '+351 912 345 678', city: 'Lisboa' }),
            c('f', 'Villa Elda Hotel', { phone: '912345678', city: 'Siena' }),
            c('g', 'Sozinho', { phone: '111222333' }),
        ]);
        expect(groups.map((g) => [g.level, g.members.map((m) => m.id)])).toEqual([
            ['certain', ['b', 'a']], // principal sugerido: o que tem envios
            ['probable', ['c', 'd']],
            ['check', ['e', 'f']],
        ]);
        expect(groups[0].reasons.sort()).toEqual(['name', 'phone']);
    });

    it('P.IVA igual já basta para "certain"', () => {
        const [g] = findDuplicateGroups([c('a', 'Uno', { tax_id: 'IT12345678901', city: 'X' }), c('b', 'Due', { tax_id: '12345678901', city: 'Y' })]);
        expect(g.level).toBe('certain');
    });

    it('valor repetido em muitos cadastros não liga ninguém', () => {
        const many = Array.from({ length: 7 }, (_, i) => c(`x${i}`, `Cliente ${i}${'abc'[i % 3]}`, { email: 'spedizioni@forwarder.com' }));
        expect(findDuplicateGroups(many)).toEqual([]);
    });

    it('par marcado como "não são duplicados" não volta', () => {
        const rows = [c('e', 'Fábio Meira', { phone: '912345678' }), c('f', 'Villa Elda Hotel', { phone: '912345678' })];
        expect(findDuplicateGroups(rows, [['f', 'e']])).toEqual([]);
    });

    it('groupPairs gera todos os pares em ordem', () => {
        expect(groupPairs(['c', 'a', 'b'])).toEqual([['a', 'c'], ['b', 'c'], ['a', 'b']]);
    });
});

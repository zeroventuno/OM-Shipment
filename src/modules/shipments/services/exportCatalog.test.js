import { describe, expect, it } from 'vitest';
import { filterCatalog } from './exportCatalog';

const rows = [
    { item: 'Forcella in carbonio', description_en: 'Carbon fibre bicycle fork', hs_code: '8714.91' },
    { item: 'Borraccia in plastica', description_en: 'Plastic bicycle water bottle', hs_code: '3926.90' },
    { item: 'Kit telaio', description_en: 'Carbon road bicycle frame kit', hs_code: null },
];

describe('filterCatalog', () => {
    it('sem busca devolve tudo', () => {
        expect(filterCatalog(rows, '  ')).toHaveLength(3);
    });
    it('busca em italiano, inglês e HS, sem diferenciar caixa', () => {
        expect(filterCatalog(rows, 'FORCELLA').map((r) => r.item)).toEqual(['Forcella in carbonio']);
        expect(filterCatalog(rows, 'bottle')).toHaveLength(1);
        expect(filterCatalog(rows, '3926')).toHaveLength(1);
        expect(filterCatalog(rows, '871491')).toHaveLength(1);
    });
    it('todas as palavras precisam aparecer', () => {
        expect(filterCatalog(rows, 'carbon kit').map((r) => r.item)).toEqual(['Kit telaio']);
        expect(filterCatalog(rows, 'carbon borraccia')).toHaveLength(0);
    });
});

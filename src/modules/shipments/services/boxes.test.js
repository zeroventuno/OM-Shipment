import { describe, expect, it } from 'vitest';
import { cleanBoxRows, rowFromPreset, toBoxRows } from './boxes';

describe('boxes', () => {
    it('vai e volta entre o banco e a tela, com vírgula', () => {
        const rows = toBoxRows([{ width: 120, height: 35, depth: 80, weight: 10.5, name: 'Bici' }]);
        expect(rows).toEqual([{ width: '120', height: '35', depth: '80', weight: '10,5', name: 'Bici' }]);
        expect(cleanBoxRows(rows)).toEqual([{ width: 120, height: 35, depth: 80, weight: 10.5, name: 'Bici' }]);
    });
    it('ignora caixa incompleta', () => {
        expect(cleanBoxRows([{ width: '50', height: '', depth: '30', weight: '2' }, { width: '1', height: '1', depth: '1', weight: '0,5' }]))
            .toEqual([{ width: 1, height: 1, depth: 1, weight: 0.5 }]);
        expect(toBoxRows(null)).toEqual([]);
    });
    it('caixa padrão entra com o peso médio', () => {
        expect(rowFromPreset({ name: 'Telaio', width: 100, height: 20, depth: 70, avg_weight: 6 }))
            .toEqual({ width: '100', height: '20', depth: '70', weight: '6', name: 'Telaio' });
        expect(rowFromPreset({ name: 'X', width: 1, height: 2, depth: 3, avg_weight: null }).weight).toBe('');
    });
});

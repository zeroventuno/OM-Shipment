import { describe, it, expect } from 'vitest';
import { analyzeQuotes, calculateProfit } from './quotes';

const q = (id, price, portal = 'MBE', carrier = 'TNT') => ({ id, price, portal, carrier });

describe('analyzeQuotes', () => {
    it('devolve null quando não há cotação com preço', () => {
        expect(analyzeQuotes([])).toBeNull();
        expect(analyzeQuotes([q(1, ''), q(2, null)])).toBeNull();
        expect(analyzeQuotes(undefined)).toBeNull();
    });

    it('ignora cotações sem preço, mas usa as que têm', () => {
        const r = analyzeQuotes([q(1, ''), q(2, '50'), q(3, '80')]);
        expect(r.best.id).toBe(2);
        expect(r.worst.id).toBe(3);
    });

    it('sem escolha explícita, assume a mais barata', () => {
        const r = analyzeQuotes([q(1, '80'), q(2, '50'), q(3, '65')]);
        expect(r.selected.id).toBe(2);
        expect(r.savings).toBe(30); // 80 - 50
    });

    it('respeita a cotação escolhida mesmo não sendo a mais barata', () => {
        const r = analyzeQuotes([q(1, '80'), q(2, '50'), q(3, '65')], 3);
        expect(r.selected.id).toBe(3);
        expect(r.savings).toBe(15); // 80 - 65
    });

    it('economia é zero quando se escolhe a mais cara', () => {
        expect(analyzeQuotes([q(1, '80'), q(2, '50')], 1).savings).toBe(0);
    });

    it('com uma cotação só, a economia é zero (não há com o que comparar)', () => {
        const r = analyzeQuotes([q(1, '42')]);
        expect(r.savings).toBe(0);
        expect(r.best.id).toBe(r.worst.id);
    });

    it('cai para a mais barata se a cotação escolhida foi removida', () => {
        const r = analyzeQuotes([q(1, '80'), q(2, '50')], 99);
        expect(r.selected.id).toBe(2);
    });

    it('compara preços como número, não como texto', () => {
        // Ordenando como string, '9' viria depois de '100' e a análise inverteria.
        const r = analyzeQuotes([q(1, '9'), q(2, '100')]);
        expect(r.best.id).toBe(1);
        expect(r.worst.id).toBe(2);
        expect(r.savings).toBe(91);
    });

    it('aceita preço vindo como número ou como string', () => {
        expect(analyzeQuotes([q(1, 50), q(2, '80')]).savings).toBe(30);
    });

    it('aceita preço zero como válido', () => {
        const r = analyzeQuotes([q(1, '0'), q(2, '30')]);
        expect(r.best.id).toBe(1);
        expect(r.savings).toBe(30);
    });
});

describe('calculateProfit', () => {
    it('lucro é o pago menos o custo', () => {
        expect(calculateProfit('100', { price: '60' })).toBe(40);
    });

    it('pode ser negativo quando se cobrou menos que o custo', () => {
        expect(calculateProfit('40', { price: '60' })).toBe(-20);
    });

    it('sem cotação escolhida, o custo é zero (envio a custo do cliente)', () => {
        expect(calculateProfit('100', null)).toBe(100);
        expect(calculateProfit('0', null)).toBe(0);
    });

    it('trata valores vazios ou inválidos como zero', () => {
        expect(calculateProfit('', { price: '60' })).toBe(-60);
        expect(calculateProfit('abc', { price: '60' })).toBe(-60);
    });
});

import { describe, it, expect } from 'vitest';
import { resolveStatus, DEFAULT_STATUS, DELIVERED } from './shipmentStatus';

describe('resolveStatus', () => {
    it('envio novo sem comprovante nasce como Pending', () => {
        expect(resolveStatus({})).toBe(DEFAULT_STATUS);
        expect(resolveStatus({ podFiles: [] })).toBe(DEFAULT_STATUS);
    });

    it('comprovante anexado marca como entregue', () => {
        expect(resolveStatus({ podFiles: ['pods/a.pdf'] })).toBe(DELIVERED);
    });

    it('comprovante vence o status atual', () => {
        expect(resolveStatus({ podFiles: ['pods/a.pdf'] }, 'In Transit')).toBe(DELIVERED);
    });

    it('sem comprovante, preserva o status já gravado', () => {
        expect(resolveStatus({}, 'In Transit')).toBe('In Transit');
        expect(resolveStatus({ podFiles: [] }, 'Exception')).toBe('Exception');
    });

    it('remover o comprovante não desfaz uma entrega já registrada', () => {
        expect(resolveStatus({ podFiles: [] }, DELIVERED)).toBe(DELIVERED);
    });

    it('aceita entrada malformada sem quebrar', () => {
        expect(resolveStatus(null)).toBe(DEFAULT_STATUS);
        expect(resolveStatus(undefined)).toBe(DEFAULT_STATUS);
        expect(resolveStatus({ podFiles: null })).toBe(DEFAULT_STATUS);
    });
});

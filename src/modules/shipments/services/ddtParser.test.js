import { describe, expect, it } from 'vitest';
import { ddtNumberFromName, parseDdtText } from './ddtParser';

// Linhas como o pdf.js tira do DDT 380 (bolla di scarico) do gestionale.
const DDT_380 = [
    'OFFICINE MATTIO SRL',
    'VIA RENZO GANDOLFO 6/A',
    '12100 CUNEO CN',
    'DESTINATARIO',
    'ALCHEMIST SRL',
    'Via Paolo Sarpi 18/6',
    '33100 UDINE (UD)',
    'NUMERO DATA',
    'Bolla di scarico',
    '2/380 20/11/2026 DESTINAZIONE',
    'PARTITA IVA/ COD. FISC. CODICE CLIENTE',
    'ALCHEMIST SRL',
    'IT02688290309 601.00507',
    'CAUSALE DI TRASPORTO CODICE ZONA COD.AGENTE PAG. Via Roma, 41',
    '30020 Cinto Caomaggiore (VE)',
    'Reso garanzia 0 1',
    'CONDIZIONI DI PAGAMENTO BANCA DI APPOGGIO',
    'L22WHEELS B2B KARBONKROME PZ 7,00',
    'DATA 20/11/26 ORA 08:53',
];

describe('parseDdtText', () => {
    it('lê série/número, data, causale e destinatário', () => {
        expect(parseDdtText(DDT_380)).toEqual({ number: '2/380', date: '2026-11-20', reason: 'Reso garanzia', consignee: 'ALCHEMIST SRL' });
    });
    it('sem o cabeçalho conhecido devolve vazio', () => {
        expect(parseDdtText(['qualquer coisa', '12/11/26'])).toEqual({ number: '', date: '', reason: '', consignee: '' });
    });
});

describe('ddtNumberFromName', () => {
    it('tira o número do nome do arquivo', () => {
        expect(ddtNumberFromName('DDT_380_ALCHEMIST.pdf')).toBe('380');
        expect(ddtNumberFromName('Bolla n. 12.pdf')).toBe('12');
        expect(ddtNumberFromName('fattura 1255.pdf')).toBe('');
    });
});

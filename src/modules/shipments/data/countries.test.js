import { describe, it, expect } from 'vitest';
import { COUNTRIES, countryCode, countryLabel, canonicalCountry, countrySpellings } from './countries';

describe('lista de países', () => {
    it('não tem países repetidos', () => {
        const codes = COUNTRIES.map(c => c.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('cobre os 167 países da lista original', () => {
        expect(COUNTRIES).toHaveLength(167);
    });

    it('todo item tem código ISO de 2 letras e um valor para gravar', () => {
        for (const c of COUNTRIES) {
            expect(c.code).toMatch(/^[A-Z]{2}$/);
            expect(c.value.length).toBeGreaterThan(0);
        }
    });

    it('o valor gravado de cada item resolve de volta para o próprio código', () => {
        for (const c of COUNTRIES) {
            expect(countryCode(c.value)).toBe(c.code);
        }
    });
});

describe('grafias duplicadas do mesmo país', () => {
    // O bug encontrado na lista original: o mesmo país aparecia duas vezes com
    // nomes diferentes, então envios para ele eram contados separadamente.
    it.each([
        ['Cingapura', 'Singapura', 'SG'],
        ['Fiji', 'Ilhas Fiji', 'FJ'],
        ['Ilhas Maurício', 'Maurícia', 'MU'],
    ])('%s e %s são o mesmo país (%s)', (a, b, code) => {
        expect(countryCode(a)).toBe(code);
        expect(countryCode(b)).toBe(code);
        expect(canonicalCountry(a)).toBe(canonicalCountry(b));
    });

    it('busca por uma grafia inclui a outra', () => {
        expect(countrySpellings('Singapura').sort()).toEqual(['Cingapura', 'Singapura']);
        expect(countrySpellings('Cingapura').sort()).toEqual(['Cingapura', 'Singapura']);
    });

    it('aparece só uma vez no dropdown', () => {
        const nomes = COUNTRIES.map(c => c.value);
        expect(nomes).toContain('Singapura');
        expect(nomes).not.toContain('Cingapura');
    });
});

describe('nome traduzido', () => {
    it('traduz para italiano e português', () => {
        expect(countryLabel('DE', 'it')).toBe('Germania');
        expect(countryLabel('DE', 'pt')).toBe('Alemanha');
    });

    it('em português usa os nomes da lista original, não os do CLDR', () => {
        // O CLDR devolveria Tchéquia, Países Baixos, Essuatíni e
        // 'Macau, RAE da China' — nomes oficiais que ninguém procura.
        expect(countryLabel('CZ', 'pt')).toBe('República Checa');
        expect(countryLabel('NL', 'pt')).toBe('Holanda');
        expect(countryLabel('SZ', 'pt')).toBe('Suazilândia');
        expect(countryLabel('MO', 'pt')).toBe('Macau');
        expect(countryLabel('CD', 'pt')).toBe('República Democrática do Congo');
    });

    it('todo país do dropdown aparece em português com o nome cadastrado', () => {
        for (const c of COUNTRIES) {
            expect(countryLabel(c.code, 'pt')).toBe(c.value);
        }
    });

    it('substitui os nomes oficiais esquisitos em italiano', () => {
        expect(countryLabel('HK', 'it')).toBe('Hong Kong');
        expect(countryLabel('MO', 'it')).toBe('Macao');
        expect(countryLabel('CD', 'it')).toBe('Rep. Dem. del Congo');
    });

    it('aceita variantes de locale como pt-BR e it-IT', () => {
        expect(countryLabel('CZ', 'pt-BR')).toBe('República Checa');
        expect(countryLabel('HK', 'it-IT')).toBe('Hong Kong');
    });

    it('aceita o nome gravado no banco, não só o código', () => {
        expect(countryLabel('Alemanha', 'it')).toBe('Germania');
        expect(countryLabel('Estados Unidos', 'it')).toBe('Stati Uniti');
    });

    it('traduz grafias antigas que não estão mais no dropdown', () => {
        expect(countryLabel('Cingapura', 'it')).toBe(countryLabel('SG', 'it'));
    });

    it('devolve o próprio valor quando o país é desconhecido, em vez de apagar o dado', () => {
        expect(countryLabel('Atlântida', 'pt')).toBe('Atlântida');
        expect(countryLabel('', 'pt')).toBe('');
        expect(countryLabel(null, 'pt')).toBe('');
    });
});

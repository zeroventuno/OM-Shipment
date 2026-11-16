import { describe, it, expect } from 'vitest';
import { detectColumns, toImportPayload, clean, dropSharedContacts, parseAddress, smartCase, cleanPhone, cleanEmail, key, resolveCountry, normalizeRow, groupRows, planImport, addressKey } from './importer.js';

describe('normalização', () => {
    it('reconhece o mesmo nome escrito de jeitos diferentes', () => {
        expect(key('Officine Mattio S.r.l.')).toBe(key('OFFICINE  MATTIO SRL'));
        expect(key('Hans Sachs Straße')).toBe(key('hans sachs strasse'));
        expect(key('République')).toBe(key('Republique'));
    });

    it('só mexe em texto todo em maiúsculas', () => {
        expect(smartCase('VIA DON ANDREA SACCONAGO 1')).toBe('Via Don Andrea Sacconago 1');
        expect(smartCase('NORTH MIAMI BEACH')).toBe('North Miami Beach');
        expect(smartCase('1891 NE 146 STREET')).toBe('1891 NE 146 Street');
        expect(smartCase('Rue de la Métallurgie 39A')).toBe('Rue de la Métallurgie 39A');
        expect(smartCase('VIA DI ROMA')).toBe('Via di Roma');
        expect(smartCase('kuwait')).toBe('Kuwait');
        expect(smartCase('DE ROSA SRL', { names: true })).toBe('De Rosa SRL');
        expect(smartCase('VDW BIKES BV', { names: true })).toBe('VDW Bikes BV');
    });

    it('limpa vírgulas, campos duplicados e lixo', () => {
        expect(clean('Via Bellini ,24')).toBe('Via Bellini, 24');
        expect(clean('IC2 Vale Gracioso IC2 Vale Gracioso')).toBe('IC2 Vale Gracioso');
        expect(clean('.')).toBeNull();
    });

    it('descarta o telefone da conta repetido em vários clientes', () => {
        const rec = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, phone: '+17863817816', email: null }));
        rec.push({ key: 'f', phone: '+390171', email: null });
        const { records, shared } = dropSharedContacts(rec);
        expect(shared.phones).toEqual(['+17863817816']);
        expect(records.map((r) => r.phone)).toEqual([null, null, null, null, null, '+390171']);
    });

    it('telefone com prefixo internacional', () => {
        expect(cleanPhone('0096597888899')).toBe('+96597888899');
        expect(cleanPhone('+44 7831 885277')).toBe('+447831885277');
        expect(cleanPhone('12')).toBeNull();
    });

    it('ignora e-mails internos', () => {
        expect(cleanEmail('ricardo@officinemattio.com')).toBeNull();
        expect(cleanEmail(' David@SpokenVelo.com ')).toBe('david@spokenvelo.com');
    });

    it('países em italiano viram o nome em português do banco', () => {
        expect(resolveCountry('Italia')?.name).toBe('Itália');
        expect(resolveCountry('Paesi Bassi')?.name).toBe('Holanda');
        expect(resolveCountry("Stati Uniti d'America")?.code).toBe('US');
        expect(resolveCountry('Rep. Ceca')?.code).toBe('CZ');
        expect(resolveCountry('Atlantide')).toBeNull();
    });
});

describe('parseAddress', () => {
    it('separa rua, CEP, cidade, província e país', () => {
        expect(parseAddress('P.ZZA S.MARIA 35 - 10060 - BRICHERASIO (TO) - Italia').address).toEqual({
            address_line1: 'P.zza S.Maria 35', address_line2: null, address_line3: null,
            postal_code: '10060', city: 'Bricherasio', region: 'TO', country: 'Itália',
        });
    });

    it('rua em várias partes e pedaços curtos', () => {
        const a = parseAddress('SQNW 307 Bloco C - Apt 523 - Due Ca - 70686-815  - BRASILIA  - Brasile').address;
        expect([a.address_line1, a.address_line2, a.address_line3]).toEqual(['SQNW 307 Bloco C', 'Apt 523', 'Due Ca']);
        expect(a.postal_code).toBe('70686-815');
        const j = parseAddress('KASHIITERIHA 7 - 8 - 3  - 813-0017 - HIGASHI-KU.FUKUOKA (FUKUOKA) - Giappone').address;
        expect(j.address_line1).toBe('Kashiiteriha 7 - 8 - 3');
        expect(j.region).toBe('Fukuoka');
    });

    it('vazio e país desconhecido', () => {
        expect(parseAddress('').address).toBeNull();
        expect(parseAddress('').problem).toBeUndefined();
        expect(parseAddress('Rua 1 - 000 - Cidade - Atlantide').problem).toMatch(/país/);
    });
});

describe('junção e plano', () => {
    const rows = [
        { 'Ragione Sociale': 'Eurobikes', 'Indirizzo Principale': 'Main St 1 - 1000 - BRUSSELS - Belgio', 'Riferimento': 'Ann', 'Telefono': '0032123456' },
        { 'Ragione Sociale': 'EUROBIKES', 'Indirizzo Principale': 'MAIN ST 1 - 1000 - Brussels - Belgio', 'Riferimento': '', 'Telefono': '' },
        { 'Ragione Sociale': 'Eurobikes', 'Indirizzo Principale': 'Shop Rd 9 - 2000 - Antwerp - Belgio', 'Riferimento': 'Bob', 'Telefono': '' },
        { 'Ragione Sociale': 'Nuovo Cliente', 'Indirizzo Principale': 'Via Roma 1 - 12100 - CUNEO (CN) - Italia', 'Riferimento': 'Nuovo Cliente', 'Telefono': '' },
    ];
    const groups = groupRows(rows.map(normalizeRow));

    it('linhas repetidas viram um cliente; endereços diferentes ficam separados', () => {
        expect(groups).toHaveLength(2);
        const euro = groups.find((g) => g.key === 'eurobikes');
        expect(euro.addresses.map((a) => a.city)).toEqual(['Brussels', 'Antwerp']);
        expect(euro.addresses[0].count).toBe(2);
        expect(euro.addresses[0].contact_name).toBe('Ann');
        // "Riferimento" igual ao nome não é contato
        expect(groups.find((g) => g.key === 'nuovocliente').contact_name).toBeNull();
    });

    it('cliente existente: preenche o vazio e só acrescenta endereços novos', () => {
        const euro = groups.find((g) => g.key === 'eurobikes');
        const existing = [{ id: 'c1', name: 'EuroBikes', address_line1: 'Main St 1', contact_name: null, phone: '+1', email: null }];
        const known = [{ customer_id: 'c1', key: euro.addresses[0].key }];
        const plan = planImport(groups, existing, known, { source: 'csv:test' });
        expect(plan.newCustomers.map((c) => c.name)).toEqual(['Nuovo Cliente']);
        expect(plan.updates).toEqual([{ id: 'c1', name: 'EuroBikes', patch: { contact_name: 'Ann' } }]);
        const added = plan.newAddresses.filter((a) => a.customerId === 'c1');
        expect(added.map((a) => [a.city, a.is_default])).toEqual([['Antwerp', false]]);
    });

    it('rodar de novo com o mesmo arquivo não muda nada', () => {
        const plan1 = planImport(groups, [], [], { source: 'csv:test' });
        const existing = plan1.newCustomers.map((c, i) => ({ id: 'id' + i, ...c }));
        const idOf = new Map(plan1.newCustomers.map((c, i) => [c.key, 'id' + i]));
        const known = plan1.newAddresses.map((a) => ({ customer_id: idOf.get(a.customerKey), key: addressKey(a) }));
        const plan2 = planImport(groups, existing, known, { source: 'csv:test' });
        expect(plan2.newCustomers).toHaveLength(0);
        expect(plan2.newAddresses).toHaveLength(0);
        expect(plan2.updates).toHaveLength(0);
    });
});

describe('colunas separadas e ida e volta', () => {
    it('lê endereço em colunas (formato DHL/Excel) com partita IVA', () => {
        const r = normalizeRow({
            'Company Name': 'BIKE POINT GMBH', 'Address Line 1': 'HAUPTSTRASSE 5', 'Postal Code': '80331',
            City: 'MÜNCHEN', 'State': 'Bayern', Country: 'DE', 'VAT Number': 'de 123 456 789', Phone: '0049 89 123456',
        });
        expect(r.name).toBe('Bike Point GmbH');
        expect(r.address).toMatchObject({ address_line1: 'Hauptstrasse 5', postal_code: '80331', city: 'München', region: 'Bayern', country: 'Alemanha' });
        expect(r.tax_id).toBe('DE123456789');
        expect(r.phone).toBe('+4989123456');
    });

    it('reconhece os cabeçalhos do arquivo exportado pela área Clienti', () => {
        const headers = ['Ragione sociale', 'Indirizzo 1', 'Indirizzo 2', 'Indirizzo 3', 'CAP', 'Città', 'Provincia', 'Paese', 'Referente', 'Telefono', 'E-mail', 'Partita IVA'];
        const found = detectColumns(headers);
        expect(Object.keys(found).sort()).toEqual(['city', 'contact', 'country', 'email', 'line1', 'line2', 'line3', 'name', 'phone', 'postal', 'region', 'tax'].sort());
    });

    it('monta o corpo da função de importação do banco', () => {
        const groups = groupRows([normalizeRow({ 'Ragione Sociale': 'Nuovo', 'Indirizzo Principale': 'Via Roma 1 - 12100 - CUNEO (CN) - Italia', 'Partita IVA': 'IT0123' })]);
        const payload = toImportPayload(planImport(groups, [], [], { source: 'csv:x' }), 'csv:x');
        expect(payload.customers[0]).toMatchObject({ key: 'nuovo', name: 'Nuovo', tax_id: 'IT0123', source: 'csv:x' });
        expect(payload.addresses[0]).toMatchObject({ customer_key: 'nuovo', customer_id: null, city: 'Cuneo', is_default: true });
        expect(payload.addresses[0].customerName).toBeUndefined();
    });
});

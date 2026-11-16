/**
 * Normalização e junção de clientes vindos das exportações dos portais.
 *
 * Regras:
 *  - O mesmo cliente é reconhecido pelo nome sem acentos, pontuação, espaços e
 *    maiúsculas ("Officine Mattio S.r.l." = "OFFICINE MATTIO SRL").
 *  - O mesmo endereço é reconhecido do mesmo jeito: rua + CEP + cidade + país.
 *  - Linhas repetidas viram um cliente só; cada endereço diferente entra como
 *    endereço de entrega a mais. O que aparece mais vezes é o padrão.
 *  - Cliente que já existe no banco: nada é sobrescrito. Só se preenche o que
 *    está vazio e se acrescentam os endereços que ainda não existem.
 */
import { COUNTRIES } from '../shipments/data/countries.js';

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export function clean(value) {
    let s = String(value ?? '').replace(/[\u00a0\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
        .replace(/^[-,;.\s]+|[-,;\s]+$/g, '')
        // "Bellini ,24" / "Bellini,24" -> "Bellini, 24"
        .replace(/\s+,/g, ',').replace(/,(?=[\p{L}\d])/gu, ', ');
    // Campo colado duas vezes: "IC2 Vale Gracioso IC2 Vale Gracioso"
    const m = s.match(/^(.{4,}) \1$/);
    if (m) s = m[1];
    return /[\p{L}\d]/u.test(s) ? s : null;
}

/** Chave de comparação: sem acento, pontuação, espaço nem maiúscula. */
export function key(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LOWER_WORDS = new Set(['di', 'da', 'de', 'del', 'della', 'dei', 'degli', 'delle', 'la', 'le', 'lo', 'il',
    'du', 'des', 'et', 'el', 'en', 'y', 'e', 'of', 'the', 'and', 'van', 'von', 'der', 'den', 'do', 'dos', 'das', 'al']);
const TITLE_SHORT = new Set(['st', 'rd', 'dr', 'av', 'ave', 'nr', 'no', 'n']);
// Tipos de empresa: ficam como se escrevem, mesmo num nome normalizado.
const LEGAL_FORMS = {
    srl: 'SRL', srls: 'SRLS', spa: 'SPA', sas: 'SAS', snc: 'SNC', sa: 'SA', sl: 'SL', sarl: 'SARL', sasu: 'SASU',
    llc: 'LLC', bv: 'BV', nv: 'NV', ag: 'AG', gmbh: 'GmbH', ltd: 'Ltd', inc: 'Inc', kg: 'KG',
    ab: 'AB', aps: 'ApS', oy: 'Oy', lda: 'Lda', ssd: 'SSD', asd: 'ASD',
};

/**
 * TEXTO TODO EM MAIÚSCULAS vira "Texto Em Maiúsculas". Mantém em maiúsculas o
 * que parece código (tem número, ou 2 letras como NE, BP) e não mexe em texto
 * que já veio com maiúsculas e minúsculas.
 */
export function smartCase(value, { names = false } = {}) {
    const s = clean(value);
    if (!s) return s;
    const allUpper = s === s.toUpperCase() && /\p{Lu}{3}/u.test(s);
    const allLower = s === s.toLowerCase() && /\p{Ll}{3}/u.test(s);
    if (!allUpper && !allLower) return s;
    let first = true;
    return s.split(/(\s+|[-/(),'.&])/).map((tok) => {
        if (!/\p{L}/u.test(tok)) return tok;
        const lower = tok.toLowerCase();
        const out = names && LEGAL_FORMS[lower] ? LEGAL_FORMS[lower]
            : /\d/.test(tok) ? tok.toUpperCase()
            : !first && LOWER_WORDS.has(lower) ? lower
            : allUpper && tok.length <= 2 && !TITLE_SHORT.has(lower) && !LOWER_WORDS.has(lower) ? tok
            // Sem vogal é sigla: VDW, BMX, MTB
            : allUpper && !/[aeiouyàáâãäåèéêëìíîïòóôõöùúûü]/.test(lower) && !TITLE_SHORT.has(lower) ? tok
            : lower.charAt(0).toUpperCase() + lower.slice(1);
        first = false;
        return out;
    }).join('')
        // Abreviações italianas de logradouro: P.zza, C.so, V.le, L.go, P.le
        .replace(/\b([PCVL])\.(Zza|So|Le|Go)\b/g, (_, a, b) => `${a}.${b.toLowerCase()}`);
}

export function cleanPhone(value) {
    const s = clean(value);
    if (!s) return null;
    let p = s.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    return p.replace(/\D/g, '').length >= 6 ? p : null;
}

/** E-mails da própria Officine Mattio aparecem em quem criou o envio, não são do cliente. */
export function cleanEmail(value, internalDomain = 'officinemattio.com') {
    const s = clean(value)?.toLowerCase();
    if (!s || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return null;
    return s.endsWith('@' + internalDomain) ? null : s;
}

export function cleanPostal(value) {
    const s = clean(value)?.toUpperCase();
    return s && !/^0+$/.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Países: nome em italiano (ou outro idioma) -> nome em português do banco
// ---------------------------------------------------------------------------

const PT_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.value]));
const ALIASES = {
    statiunitidamerica: 'US', usa: 'US', repceca: 'CZ', repubblicaceca: 'CZ', canarie: 'ES',
    olanda: 'NL', inghilterra: 'GB', granbretagna: 'GB', corea: 'KR', coreadelsud: 'KR', uk: 'GB',
};
let nameToCode;
function countryIndex() {
    if (nameToCode) return nameToCode;
    nameToCode = new Map(Object.entries(ALIASES));
    const langs = ['it', 'pt', 'en', 'es', 'fr', 'de'].map((l) => new Intl.DisplayNames([l], { type: 'region' }));
    for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
            const code = String.fromCharCode(a, b);
            for (const dn of langs) {
                const name = dn.of(code);
                if (name && name !== code && !nameToCode.has(key(name))) nameToCode.set(key(name), code);
            }
        }
    }
    for (const c of COUNTRIES) nameToCode.set(key(c.value), c.code);
    return nameToCode;
}

/** { code, name } com o nome em português usado no banco, ou null. */
export function resolveCountry(value) {
    const k = key(value);
    if (!k) return null;
    const code = k.length === 2 ? k.toUpperCase() : countryIndex().get(k);
    if (!code) return null;
    const name = PT_BY_CODE[code] ?? new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code);
    return name && name !== code ? { code, name } : null;
}

// ---------------------------------------------------------------------------
// Endereço em uma linha: "Rua - CEP - CIDADE (PROV) - País"
// ---------------------------------------------------------------------------

export function parseAddress(raw) {
    const parts = String(raw ?? '').split(/\s+-\s+|\s+-\s*$|^\s*-\s+/).map(clean).filter(Boolean);
    if (parts.length === 0) return { address: null };
    if (parts.length < 3) return { address: null, problem: 'endereço incompleto' };

    const countryRaw = parts.pop();
    const country = resolveCountry(countryRaw);
    if (!country) return { address: null, problem: `país não reconhecido: ${countryRaw}` };

    let cityRaw = parts.pop();
    // "Rua - CEP - Cidade - País"; com 3 pedaços não há CEP.
    const postal = parts.length >= 2 ? parts.pop() : null;

    let region = null;
    const m = cityRaw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (m) { cityRaw = m[1]; region = clean(m[2]); }
    if (region) region = region.length <= 3 ? region.toUpperCase() : smartCase(region);
    if (!region && key(countryRaw) === 'canarie') region = 'Canarias';

    // Pedaços curtos ("8", "3", "7* D") ficam grudados na linha anterior.
    const lines = [];
    for (const p of parts) {
        if (lines.length && (p.length <= 4 || lines.length === 3)) lines[lines.length - 1] += ' - ' + p;
        else lines.push(p);
    }
    const city = smartCase(cityRaw);
    if (!lines.length || !city) return { address: null, problem: 'endereço incompleto' };
    return {
        address: {
            address_line1: smartCase(lines[0]),
            address_line2: smartCase(lines[1]) ?? null,
            address_line3: smartCase(lines[2]) ?? null,
            postal_code: cleanPostal(postal),
            city,
            region,
            country: country.name,
        },
        countryCode: country.code,
    };
}

export const addressKey = (a) => a && [
    key([a.address_line1, a.address_line2, a.address_line3].filter(Boolean).join(' ')),
    key(a.postal_code), key(a.city), resolveCountry(a.country)?.code ?? key(a.country),
].join('|');

// ---------------------------------------------------------------------------
// Colunas de cada portal
// ---------------------------------------------------------------------------

// Nomes de coluna aceitos (comparados sem maiúsculas, espaços e pontuação).
// Inclui os cabeçalhos do arquivo exportado pela área Clienti, para o
// arquivo poder voltar depois de editado no Excel.
export const COLUMNS = {
    name: ['Ragione Sociale', 'Ragione Sociale Destinatario', 'Company', 'Company Name', 'Azienda', 'Nome', 'Name', 'Destinatario', 'Cliente', 'Customer', 'Receiver', 'Recipient', 'Empresa'],
    // Endereço inteiro numa célula: "Rua - CEP - Cidade (Prov) - País" (MBE)
    address: ['Indirizzo Principale', 'Indirizzo', 'Address', 'Endereço', 'Full Address'],
    line1: ['Indirizzo 1', 'Indirizzo riga 1', 'Address 1', 'Address Line 1', 'Address1', 'Street', 'Street Address', 'Via', 'Endereço 1'],
    line2: ['Indirizzo 2', 'Indirizzo riga 2', 'Address 2', 'Address Line 2', 'Address2', 'Endereço 2'],
    line3: ['Indirizzo 3', 'Indirizzo riga 3', 'Address 3', 'Address Line 3', 'Address3', 'Endereço 3'],
    postal: ['CAP', 'Postal Code', 'Postcode', 'Zip', 'ZIP Code', 'Zip Code', 'CEP', 'Codice Postale', 'PLZ'],
    city: ['Città', 'Citta', 'City', 'Località', 'Localita', 'Comune', 'Cidade', 'Town', 'Ort'],
    region: ['Provincia', 'Prov', 'Regione', 'Region', 'State', 'State/Province', 'County', 'Estado'],
    country: ['Paese', 'Nazione', 'Stato', 'Country', 'Country Code', 'Codice Paese', 'País', 'Pais', 'Land'],
    email: ['e-Mail', 'Email', 'E-mail', 'Email Address', 'Posta elettronica'],
    contact: ['Riferimento', 'Contatto', 'Contact', 'Contact Name', 'Referente', 'Nome contatto', 'Persona di contatto', 'Contato'],
    phone: ['Telefono', 'Phone', 'Phone Number', 'Cellulare', 'Tel', 'Mobile', 'Telefone'],
    tax: ['Partita IVA', 'Numero Partita Iva', 'P.IVA', 'P. IVA', 'PIVA', 'Codice Fiscale', 'Codice fiscale / Partita IVA', 'VAT', 'VAT Number', 'Tax ID', 'EORI', 'CNPJ', 'NIF'],
};
const pick = (row, names) => {
    const wanted = new Set(names.map(key));
    for (const k of Object.keys(row)) if (wanted.has(key(k)) && clean(row[k])) return row[k];
    return null;
};

/** Quais grupos de colunas (name, address, city…) aparecem no cabeçalho. */
export function detectColumns(headers) {
    return Object.fromEntries(Object.entries(COLUMNS)
        .map(([field, names]) => [field, headers.find((h) => names.some((n) => key(n) === key(h))) ?? null])
        .filter(([, h]) => h));
}

/** Endereço em colunas separadas (rua, CEP, cidade, país). */
function addressFromColumns(row) {
    const line1 = pick(row, COLUMNS.line1) ?? pick(row, COLUMNS.address);
    const city = pick(row, COLUMNS.city);
    const countryRaw = pick(row, COLUMNS.country);
    if (!clean(line1) && !clean(city)) return { address: null };
    if (!clean(line1) || !clean(city) || !clean(countryRaw)) return { address: null, problem: 'endereço incompleto' };
    const country = resolveCountry(countryRaw);
    if (!country) return { address: null, problem: `país não reconhecido: ${clean(countryRaw)}` };
    const region = clean(pick(row, COLUMNS.region));
    return {
        address: {
            address_line1: smartCase(line1),
            address_line2: smartCase(pick(row, COLUMNS.line2)) ?? null,
            address_line3: smartCase(pick(row, COLUMNS.line3)) ?? null,
            postal_code: cleanPostal(pick(row, COLUMNS.postal)),
            city: smartCase(city),
            region: region ? (region.length <= 3 ? region.toUpperCase() : smartCase(region)) : null,
            country: country.name,
        },
    };
}

/** Linha crua da planilha -> registro normalizado (ou motivo para pular). */
export function normalizeRow(row) {
    const rawName = clean(pick(row, COLUMNS.name));
    if (!rawName) return { skip: 'sem nome' };
    const name = smartCase(rawName, { names: true });
    // Com coluna de cidade, o endereço vem separado; sem ela, numa célula só.
    const separate = Object.keys(row).some((k) => COLUMNS.city.some((n) => key(n) === key(k)));
    const { address, problem } = separate ? addressFromColumns(row) : parseAddress(pick(row, COLUMNS.address));
    const contact = smartCase(pick(row, COLUMNS.contact));
    return {
        name,
        key: key(name),
        address,
        problem,
        // Quando "Riferimento" só repete o nome do cliente, não é um contato.
        contact: contact && key(contact) !== key(name) ? contact : null,
        phone: cleanPhone(pick(row, COLUMNS.phone)),
        email: cleanEmail(pick(row, COLUMNS.email)),
        tax_id: clean(pick(row, COLUMNS.tax))?.toUpperCase().replace(/\s+/g, '') ?? null,
    };
}

// ---------------------------------------------------------------------------
// Plano de importação
// ---------------------------------------------------------------------------

const mostCommon = (values) => {
    const counts = new Map();
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = null, n = 0;
    for (const [v, c] of counts) if (c > n) { best = v; n = c; }
    return best;
};

/**
 * Telefone ou e-mail que aparece em muitos clientes diferentes é o da conta no
 * portal (preenchido por padrão), não do cliente: sai de todas as linhas.
 */
export function dropSharedContacts(records, maxCustomers = 3) {
    const owners = { phone: new Map(), email: new Map() };
    for (const r of records) {
        if (r.skip) continue;
        for (const f of ['phone', 'email']) {
            if (!r[f]) continue;
            if (!owners[f].has(r[f])) owners[f].set(r[f], new Set());
            owners[f].get(r[f]).add(r.key);
        }
    }
    const shared = { phone: new Set(), email: new Set() };
    for (const f of ['phone', 'email']) for (const [v, set] of owners[f]) if (set.size > maxCustomers) shared[f].add(v);
    return {
        records: records.map((r) => (r.skip ? r : {
            ...r,
            phone: shared.phone.has(r.phone) ? null : r.phone,
            email: shared.email.has(r.email) ? null : r.email,
        })),
        shared: { phones: [...shared.phone], emails: [...shared.email] },
    };
}

/** Agrupa as linhas por cliente e, dentro dele, por endereço. */
export function groupRows(records) {
    const groups = new Map();
    for (const r of records) {
        if (r.skip) continue;
        let g = groups.get(r.key);
        if (!g) groups.set(r.key, (g = { key: r.key, names: [], contacts: [], phones: [], emails: [], taxes: [], addresses: new Map(), rows: 0 }));
        g.rows++;
        g.names.push(r.name);
        g.contacts.push(r.contact); g.phones.push(r.phone); g.emails.push(r.email); g.taxes.push(r.tax_id);
        if (r.address) {
            const k = addressKey(r.address);
            let a = g.addresses.get(k);
            if (!a) g.addresses.set(k, (a = { key: k, ...r.address, contacts: [], phones: [], count: 0 }));
            a.count++;
            a.contacts.push(r.contact); a.phones.push(r.phone);
        }
    }
    return [...groups.values()].map((g) => {
        const addresses = [...g.addresses.values()]
            .map(({ contacts, phones, ...a }) => ({ ...a, contact_name: mostCommon(contacts), phone: mostCommon(phones) }))
            .sort((x, y) => y.count - x.count);
        return {
            key: g.key,
            name: mostCommon(g.names),
            contact_name: mostCommon(g.contacts),
            phone: mostCommon(g.phones),
            email: mostCommon(g.emails),
            tax_id: mostCommon(g.taxes),
            rows: g.rows,
            addresses,
        };
    });
}

/**
 * Compara com o banco e decide o que inserir.
 * existing: [{ id, name, address_line1, contact_name, phone, email }]
 * existingAddresses: [{ customer_id, key }]
 */
/**
 * @param {any[]} groups
 * @param {any[]} existing
 * @param {{ customer_id: string, key: string }[]} existingAddresses
 * @param {{ source?: string, maxAddresses?: number }} [options]
 */
export function planImport(groups, existing, existingAddresses, { source, maxAddresses = 30 } = {}) {
    const byKey = new Map();
    for (const c of existing) if (!byKey.has(key(c.name))) byKey.set(key(c.name), c);
    const addrByCustomer = new Map();
    for (const a of existingAddresses) {
        if (!addrByCustomer.has(a.customer_id)) addrByCustomer.set(a.customer_id, new Set());
        addrByCustomer.get(a.customer_id).add(a.key);
    }

    const plan = { newCustomers: [], updates: [], newAddresses: [], unchanged: 0, truncated: [] };
    for (const g of groups) {
        const main = g.addresses[0] ?? null;
        const mainFields = main ? {
            address_line1: main.address_line1, address_line2: main.address_line2, address_line3: main.address_line3,
            postal_code: main.postal_code, city: main.city, region: main.region, country: main.country,
        } : {};
        const found = byKey.get(g.key);
        let addresses = g.addresses;
        if (addresses.length > maxAddresses) {
            plan.truncated.push({ name: g.name, total: addresses.length });
            addresses = addresses.slice(0, maxAddresses);
        }

        if (!found) {
            plan.newCustomers.push({
                key: g.key, name: g.name, ...mainFields,
                contact_name: main?.contact_name ?? g.contact_name, phone: main?.phone ?? g.phone, email: g.email, tax_id: g.tax_id, source,
            });
            addresses.forEach((a, i) => plan.newAddresses.push({ customerKey: g.key, customerName: g.name, ...addr(a), is_default: i === 0 }));
            continue;
        }

        const patch = {};
        if (!found.address_line1 && main) Object.assign(patch, mainFields);
        for (const [f, v] of [['contact_name', main?.contact_name ?? g.contact_name], ['phone', main?.phone ?? g.phone], ['email', g.email], ['tax_id', g.tax_id]]) {
            if (!found[f] && v) patch[f] = v;
        }
        const known = addrByCustomer.get(found.id) ?? new Set();
        const missing = addresses.filter((a) => !known.has(a.key)).slice(0, Math.max(0, maxAddresses - known.size));
        if (Object.keys(patch).length) plan.updates.push({ id: found.id, name: found.name, patch });
        missing.forEach((a, i) => plan.newAddresses.push({
            customerId: found.id, customerName: found.name, ...addr(a), is_default: known.size === 0 && i === 0,
        }));
        if (!Object.keys(patch).length && !missing.length) plan.unchanged++;
    }
    return plan;
}

const addr = (a) => ({
    address_line1: a.address_line1, address_line2: a.address_line2, address_line3: a.address_line3,
    postal_code: a.postal_code, city: a.city, region: a.region, country: a.country,
    contact_name: a.contact_name, phone: a.phone,
});

/** Plano -> corpo da função import_customers do banco (usada pela tela e pelo terminal). */
export function toImportPayload(plan, source) {
    return {
        source,
        customers: plan.newCustomers,
        updates: plan.updates.map((u) => ({ id: u.id, patch: u.patch })),
        addresses: plan.newAddresses.map(({ customerId, customerKey, ...a }) => {
            delete a.customerName;
            return { ...a, customer_id: customerId ?? null, customer_key: customerKey ?? null };
        }),
    };
}

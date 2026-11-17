/**
 * Possíveis clientes duplicados.
 *
 * Dois cadastros ficam no mesmo grupo quando têm igual pelo menos um destes:
 *   - P.IVA (sem prefixo de país nem pontuação);
 *   - e-mail;
 *   - telefone (últimos 9 dígitos);
 *   - nome sem forma jurídica (SRL, SPA, GmbH, Inc…), acentos e pontuação.
 * Valor que aparece em mais de 6 cadastros (telefone da conta, e-mail de
 * despachante) não liga ninguém.
 *
 * Confiança do grupo:
 *   - certain:  P.IVA igual, ou dois sinais juntos, ou mesmo nome-base;
 *   - probable: um sinal só, mas todos na mesma cidade;
 *   - check:    um sinal só, cidades diferentes.
 *
 * Pares marcados como "não são duplicados" nunca se ligam.
 */

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const LEGAL_FORMS = new RegExp('\\b(' + [
    's\\.?\\s?r\\.?\\s?l\\.?s?', 's\\.?\\s?p\\.?\\s?a\\.?', 's\\.?\\s?n\\.?\\s?c\\.?', 's\\.?\\s?a\\.?\\s?s\\.?', 'sa\'?rl', 'eurl',
    'gmbh', 'ag', 'kg', 'ltd', 'limited', 'inc', 'llc', 'corp', 'co', 'sl', 'slu', 'b\\.?v\\.?', 'nv', 'lda', 'oy', 'ab', 'aps', 'as',
    'sro', 'spol', 'unipersonale', 'unipessoal',
].join('|') + ')\\b', 'g');

/** Nome-base: sem forma jurídica, acento, pontuação nem espaço. */
export function nameCore(name) {
    return fold(name).replace(/[.']/g, '').replace(LEGAL_FORMS, ' ').replace(/[^a-z0-9]/g, '');
}

export function phoneKey(phone) {
    const d = String(phone ?? '').replace(/\D/g, '');
    return d.length >= 7 && !/^0+$/.test(d) ? d.slice(-9) : null;
}

export function emailKey(email, internalDomain = 'officinemattio') {
    const e = fold(email).trim();
    return /^[^@\s]+@[^@\s]+$/.test(e) && !e.includes(internalDomain) ? e : null;
}

export function taxKey(tax) {
    const t = fold(tax).replace(/[^a-z0-9]/g, '').replace(/^[a-z]{2}(?=\d)/, '');
    return t.length >= 6 && !/^0+$/.test(t) ? t : null;
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const MAX_BUCKET = 6;

const SIGNALS = [
    ['tax', (c) => taxKey(c.tax_id)],
    ['email', (c) => emailKey(c.email)],
    ['phone', (c) => phoneKey(c.phone)],
    ['name', (c) => { const k = nameCore(c.name); return k.length >= 3 ? k : null; }],
];

/** Quanto o cadastro "pesa": histórico primeiro, depois campos preenchidos. */
export function customerWeight(c) {
    const history = (c.shipments ?? 0) + (c.tickets ?? 0) + (c.warranties ?? 0) + (c.requests ?? 0);
    const filled = ['address_line1', 'postal_code', 'city', 'country', 'contact_name', 'phone', 'email', 'tax_id']
        .filter((f) => String(c[f] ?? '').trim() !== '').length;
    return history * 100 + (c.addresses ?? 0) * 10 + filled;
}

/**
 * @param {Array<Record<string, any>>} customers linhas de customer_overview
 * @param {Array<[string, string]>} dismissed pares marcados como "não são duplicados"
 * @returns grupos ordenados por confiança, com o principal sugerido em primeiro
 */
export function findDuplicateGroups(customers, dismissed = []) {
    const blocked = new Set(dismissed.map(([a, b]) => pairKey(a, b)));
    const parent = new Map(customers.map((c) => [c.id, c.id]));
    const find = (x) => {
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r);
        parent.set(x, r);
        return r;
    };
    const reasons = new Map(); // pairKey -> Set(signal)

    for (const [signal, keyOf] of SIGNALS) {
        const buckets = new Map();
        for (const c of customers) {
            const k = keyOf(c);
            if (!k) continue;
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(c.id);
        }
        for (const ids of buckets.values()) {
            if (ids.length < 2 || ids.length > MAX_BUCKET) continue;
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const pk = pairKey(ids[i], ids[j]);
                    if (blocked.has(pk)) continue;
                    if (!reasons.has(pk)) reasons.set(pk, new Set());
                    reasons.get(pk).add(signal);
                    const ra = find(ids[i]), rb = find(ids[j]);
                    if (ra !== rb) parent.set(ra, rb);
                }
            }
        }
    }

    const groups = new Map();
    for (const c of customers) {
        const r = find(c.id);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(c);
    }

    const order = { certain: 0, probable: 1, check: 2 };
    return [...groups.values()]
        .filter((g) => g.length > 1)
        .map((members) => {
            const why = new Set();
            let strongPair = false;
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    const r = reasons.get(pairKey(members[i].id, members[j].id));
                    if (!r) continue;
                    r.forEach((s) => why.add(s));
                    if (r.has('tax') || r.has('name') || r.size >= 2) strongPair = true;
                }
            }
            const cities = new Set(members.map((m) => fold(m.city).replace(/[^a-z]/g, '')).filter(Boolean));
            const level = strongPair ? 'certain' : cities.size <= 1 ? 'probable' : 'check';
            const sorted = [...members].sort((a, b) => customerWeight(b) - customerWeight(a) || a.name.localeCompare(b.name));
            return { id: sorted.map((m) => m.id).sort().join('|'), level, reasons: [...why], members: sorted };
        })
        .sort((a, b) => order[a.level] - order[b.level] || a.members[0].name.localeCompare(b.members[0].name));
}

/** Todos os pares de um grupo, para gravar "não são duplicados". */
export function groupPairs(ids) {
    const pairs = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) pairs.push(ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]);
    }
    return pairs;
}

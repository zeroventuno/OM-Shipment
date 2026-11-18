import { addressKey } from '../../customers/importer.js';

/** Regras para preencher o remetente da proforma a partir da ficha do cliente. */

/** Valor do seletor de endereço quando o usuário vai digitar um endereço novo. */
export const NEW_ADDRESS = 'new';

const nameWords = (name) => [...new Set(
    String(name || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [],
)];

/**
 * Mesmo cliente com o nome mais curto ou mais longo, em qualquer ordem:
 * "ALONZO AGUIRRE ROCHA" = "Alonzo Aguirre". Uma palavra só em comum não basta.
 */
export function namesMatch(a, b) {
    const [small, large] = [nameWords(a), nameWords(b)].sort((x, y) => x.length - y.length);
    if (!small.length) return false;
    if (small.length < 2 && small.length !== large.length) return false;
    return small.every((w) => large.includes(w));
}

const addressText = (a) => [a.address_line1, a.address_line2, a.address_line3].filter(Boolean).join(', ');

/** Endereços de entrega do cliente mais o principal da ficha, sem repetir. */
export function addressOptions(customer, rows = []) {
    const options = new Map();
    for (const a of [...rows, customer]) {
        if (!a?.address_line1) continue;
        const key = addressKey(a);
        if (options.has(key)) continue;
        const place = [a.postal_code, a.city, a.country].filter(Boolean).join(' ');
        const text = [addressText(a), place].filter(Boolean).join(' · ');
        options.set(key, { key, label: a.label ? `${a.label} · ${text}` : text, address: a });
    }
    return [...options.values()];
}

/** Um endereço só já vem escolhido; vários, o usuário escolhe; nenhum, é novo. */
export function initialAddressChoice(options) {
    if (options.length === 1) return options[0].key;
    return options.length ? '' : NEW_ADDRESS;
}

/** Campos do remetente que dependem do endereço escolhido. */
export function shipperAddressFields(customer, option, pickupCountry) {
    const a = option?.address;
    return {
        address: a ? addressText(a) : '',
        postal_code: a?.postal_code || '',
        city: a?.city || '',
        country: a?.country || pickupCountry || customer?.country || '',
        contact: a?.contact_name || customer?.contact_name || '',
        phone: a?.phone || customer?.phone || '',
    };
}

export function shipperFromCustomer(customer, option, { name, country }) {
    return {
        name: customer?.name || name || '',
        tax_id: customer?.tax_id || '',
        email: customer?.email || '',
        ...shipperAddressFields(customer, option, country),
    };
}

/** Endereço novo a gravar na ficha; null se estiver incompleto ou já existir. */
export function addressToSave(shipper, options) {
    const row = {
        address_line1: shipper.address.trim(),
        postal_code: shipper.postal_code.trim(),
        city: shipper.city.trim(),
        country: shipper.country.trim(),
        contact_name: shipper.contact.trim(),
        phone: shipper.phone.trim(),
    };
    if (!row.address_line1 || !row.city || !row.country) return null;
    const key = addressKey(row);
    return options.some((o) => o.key === key) ? null : row;
}

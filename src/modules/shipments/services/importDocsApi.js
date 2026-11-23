import { supabase } from '@/lib/supabase';
import { buildImportPdf, importCode } from './importDocs';
import { downloadBytes } from './exportDocs';
import { addressOptions, namesMatch } from './customerShipper';
import { listAddresses, saveAddress } from '@/modules/customers/api';

/** Proforma de importação: leitura, emissão (número dado pelo banco) e PDF. */

const COLS = 'id, number, code, issued_on, shipment_id, customer_id, shipper, items, parcels, reason, notes, returned, total_value, cancelled, created_at';

export async function listImportDocs(shipmentId) {
    let q = supabase.from('import_documents').select(COLS).order('number', { ascending: false });
    if (shipmentId) q = q.eq('shipment_id', shipmentId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

/** Grava (novo → próximo número; com id → mantém o número). */
export async function issueImportDoc(doc) {
    const { data, error } = await supabase.rpc('issue_import_document', { doc });
    if (error) throw error;
    return data;
}

export async function setImportDocCancelled(id, cancelled) {
    const { error } = await supabase.from('import_documents')
        .update({ cancelled, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
}

const CUSTOMER_COLS = 'id, name, address_line1, address_line2, address_line3, postal_code, city, region, country, tax_id, phone, email, contact_name';

/** Ficha do cliente pelo nome do envio, para preencher o remetente. */
export async function findCustomerByName(name) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const { data } = await supabase.from('customers')
        .select(CUSTOMER_COLS)
        .ilike('name', clean.replace(/[\\%_]/g, (c) => `\\${c}`))
        .limit(1);
    return data?.[0] || null;
}

export async function loadCustomer(id) {
    const { data, error } = await supabase.from('customers').select(CUSTOMER_COLS).eq('id', id).single();
    if (error) throw error;
    return data;
}

/**
 * Ficha do cliente da retirada: nome igual ou, se não houver, o único cadastro
 * com o nome mais curto/longo ("ALONZO AGUIRRE ROCHA" → "Alonzo Aguirre").
 */
export async function findCustomerForShipment(name) {
    const exact = await findCustomerByName(name);
    if (exact) return exact;
    const words = String(name || '').match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 6) || [];
    if (words.length === 0) return null;
    const { data, error } = await supabase.from('customers').select('id, name')
        .or(words.map((w) => `name.ilike."*${w}*"`).join(',')).limit(1000);
    if (error) throw error;
    const found = (data || []).filter((c) => namesMatch(c.name, name));
    return found.length === 1 ? loadCustomer(found[0].id) : null;
}

export const loadAddressOptions = async (customer) => addressOptions(customer, await listAddresses(customer.id));

/** Endereço novo na ficha; vira o padrão se o cliente ainda não tiver nenhum. */
export async function addCustomerAddress(customerId, address) {
    const rows = await listAddresses(customerId);
    await saveAddress(customerId, address, rows.length === 0);
}

/**
 * Cliente cadastrado com todas as palavras do nome, em qualquer ordem
 * ("LANGTON HEWER SIMON" → "SIMON LANGTON HEWER"). Só devolve se for um só.
 */
export async function findCustomerByTokens(name) {
    const words = String(name || '').trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
    if (!words.length) return null;
    let q = supabase.from('customers').select('id, name, country');
    for (const w of words) q = q.ilike('name', `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const { data } = await q.limit(2);
    return data?.length === 1 ? data[0] : null;
}

export async function loadExportCatalog() {
    const { data } = await supabase.from('export_catalog')
        .select('id, section, item, description_en, hs_code, origin, composition, erp_codes').eq('active', true).order('sort_order');
    return data || [];
}

/**
 * Grava a relação "código da fatura → produto": nas próximas faturas o mesmo
 * código já vem com descrição, HS e origem. Ignora o que já está relacionado.
 */
export async function saveCodeRelations(pairs, catalog) {
    for (const { code, catalogId } of pairs) {
        const row = catalog.find((c) => c.id === catalogId);
        if (!row || !code || (row.erp_codes || []).includes(code)) continue;
        const erp_codes = [...(row.erp_codes || []), code];
        const { error } = await supabase.from('export_catalog').update({ erp_codes, updated_at: new Date().toISOString() }).eq('id', catalogId);
        if (!error) row.erp_codes = erp_codes;
    }
}

let signatureCache;
export async function loadSignature() {
    if (signatureCache !== undefined) return signatureCache;
    const { data } = await supabase.from('company_assets').select('data_base64').eq('key', 'legal_rep_signature').maybeSingle();
    signatureCache = data?.data_base64 ? Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0)) : null;
    return signatureCache;
}

/** Gera o PDF assinado de um documento gravado e baixa. */
export async function downloadImportDoc(row, { sign = true } = {}) {
    const [logo, signature] = await Promise.all([
        fetch('/logo.png').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
        sign ? loadSignature() : null,
    ]);
    const bytes = await buildImportPdf({ doc: row, logoBytes: logo, signatureBytes: signature });
    const who = (row.shipper?.name || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    downloadBytes(bytes, `${importCode(row.number)}${who ? `_${who}` : ''}.pdf`);
}

/** Caixas padrão da Officine Mattio (as mesmas do formulário de pedido). */
export async function loadBoxPresets() {
    const { data, error } = await supabase.from('box_presets')
        .select('id, name, width, height, depth, avg_weight')
        .eq('active', true)
        .order('sort_order').order('name');
    if (error) throw error;
    return data || [];
}

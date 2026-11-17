import { supabase } from '@/lib/supabase';
import { buildImportPdf, importCode } from './importDocs';
import { downloadBytes } from './exportDocs';

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

/** Ficha do cliente pelo nome do envio, para preencher o remetente. */
export async function findCustomerByName(name) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const { data } = await supabase.from('customers')
        .select('id, name, address_line1, address_line2, postal_code, city, region, country, tax_id, phone, email, contact_name')
        .ilike('name', clean.replace(/[\\%_]/g, (c) => `\\${c}`))
        .limit(1);
    return data?.[0] || null;
}

export async function loadExportCatalog() {
    const { data } = await supabase.from('export_catalog')
        .select('id, item, description_en, hs_code, origin').eq('active', true).order('sort_order');
    return data || [];
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

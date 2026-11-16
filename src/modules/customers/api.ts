import { requireSupabase } from "@/lib/supabase";
import type { AddressInput, CustomerAddress, CustomerInput } from "@/modules/requests/api";
import { addressKey } from "./importer.js";

/** Cliente com os totais do que ele já teve (view customer_overview). */
export interface CustomerRow {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  addresses: number;
  shipments: number;
  first_shipment: string | null;
  last_shipment: string | null;
  freight_cost: number | string;
  tickets: number;
  warranties: number;
  requests: number;
}

export interface CustomerActivity {
  shipments: {
    id: string; created_at: string; order_id: string | null; order_type: string | null; status: string;
    destination_country: string | null; portal: string | null; carrier: string | null; cost: number | null;
    customer_payment: number | null; tracking_code: string | null; service_level: string | null;
    ticket_id: string | null; warranty_id: string | null;
  }[];
  tickets: {
    id: string; created_at: string; component: string | null; brand: string | null; phase: string;
    approval_status: string | null; completion_date: string | null;
  }[];
  warranties: {
    id: string; created_at: string; protocol_number: string | null; status: string | null; process_type: string | null;
    bike_model: string | null; size: string | null; solution: string | null; value: string | null; order_number: string | null;
  }[];
  requests: {
    id: string; created_at: string; status: string; service_level: string; invoice_value: number | null;
    insured_value: number | null; requested_by: string; shipment_id: string | null;
  }[];
}

export const CUSTOMERS_KEY = ["customers"];
export const customerKey = (id: string) => ["customers", id];

/** PostgREST devolve no máximo 1000 linhas por vez: busca em páginas. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export const listCustomers = () =>
  fetchAll<CustomerRow>((from, to) => requireSupabase().from("customer_overview").select("*").order("name").range(from, to));

export async function getCustomer(id: string): Promise<CustomerRow> {
  const { data, error } = await requireSupabase().from("customer_overview").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as CustomerRow;
}

export async function getActivity(id: string): Promise<CustomerActivity> {
  const { data, error } = await requireSupabase().rpc("customer_activity", { c_id: id });
  if (error) throw new Error(error.message);
  return data as CustomerActivity;
}

const blankToNull = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? (v.trim() || null) : v]));

export type CustomerEdit = CustomerInput & { notes?: string };

export async function createCustomer(input: CustomerEdit): Promise<string> {
  const { data, error } = await requireSupabase()
    .from("customers")
    .insert({ ...blankToNull(input), source: "app" })
    .select("id")
    .single();
  if (error) throw new Error(error.code === "23505" ? "DUPLICATE" : error.message);
  return data.id as string;
}

export async function updateCustomer(id: string, input: Partial<CustomerEdit>) {
  const { error } = await requireSupabase().from("customers").update(blankToNull(input)).eq("id", id);
  if (error) throw new Error(error.code === "23505" ? "DUPLICATE" : error.message);
}

/** Só clientes sem nenhum envio, assistência, garantia ou pedido podem ser apagados. */
export async function deleteCustomer(id: string) {
  const { error } = await requireSupabase().from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- endereços de entrega

export async function listAddresses(customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await requireSupabase()
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerAddress[];
}

export async function saveAddress(customerId: string, input: AddressInput & { id?: string }, makeDefault: boolean) {
  const db = requireSupabase();
  const { id, ...fields } = input;
  // Só um endereço padrão por cliente: tira o atual antes de marcar outro.
  if (makeDefault) {
    const { error } = await db.from("customer_addresses").update({ is_default: false }).eq("customer_id", customerId).eq("is_default", true);
    if (error) throw new Error(error.message);
  }
  const row = { ...blankToNull(fields), customer_id: customerId, ...(makeDefault ? { is_default: true } : {}) };
  const { error } = id
    ? await db.from("customer_addresses").update(row).eq("id", id)
    : await db.from("customer_addresses").insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteAddress(id: string) {
  const { error } = await requireSupabase().from("customer_addresses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export const listAllAddresses = () =>
  fetchAll<CustomerAddress & { customer_id: string }>((from, to) =>
    requireSupabase().from("customer_addresses").select("*").order("customer_id").order("is_default", { ascending: false }).range(from, to));

/** Endereços já cadastrados, como chaves, para o importador não repetir. */
export async function existingAddressKeys() {
  const all = await listAllAddresses();
  return all.map((a) => ({ customer_id: a.customer_id, key: addressKey(a) as string }));
}

export async function runImport(payload: unknown): Promise<{ customers: number; updated: number; addresses: number }> {
  const { data, error } = await requireSupabase().rpc("import_customers", { plan: payload });
  if (error) throw new Error(error.message);
  return data as { customers: number; updated: number; addresses: number };
}

// --- exportação (CSV que abre direto no Excel italiano)

export const EXPORT_HEADERS = [
  "Ragione sociale", "Referente", "Telefono", "E-mail", "Partita IVA",
  "Etichetta indirizzo", "Indirizzo predefinito", "Indirizzo 1", "Indirizzo 2", "Indirizzo 3", "CAP", "Città", "Provincia", "Paese",
  "Spedizioni", "Ultima spedizione", "Assistenze", "Garanzie", "Origine",
] as const;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Uma linha por endereço de entrega (cliente sem endereço: uma linha com o
 * endereço principal). Separador ";" e BOM para o Excel abrir em italiano.
 */
export function buildCustomersCsv(
  customers: CustomerRow[],
  addresses: (CustomerAddress & { customer_id: string })[],
  countryName: (stored: string | null) => string,
) {
  const byCustomer = new Map<string, (CustomerAddress & { customer_id: string })[]>();
  for (const a of addresses) byCustomer.set(a.customer_id, [...(byCustomer.get(a.customer_id) ?? []), a]);
  const lines = [EXPORT_HEADERS.join(";")];
  for (const c of customers) {
    const common = [c.name, c.contact_name, c.phone, c.email, c.tax_id];
    const tail = [c.shipments, c.last_shipment?.slice(0, 10) ?? "", c.tickets, c.warranties, c.source];
    const list = byCustomer.get(c.id) ?? [];
    if (list.length === 0) {
      lines.push([...common, "", "", c.address_line1, c.address_line2, c.address_line3, c.postal_code, c.city, c.region, c.country ? countryName(c.country) : "", ...tail].map(csvCell).join(";"));
    }
    for (const a of list) {
      lines.push([
        c.name, a.contact_name ?? c.contact_name, a.phone ?? c.phone, c.email, c.tax_id,
        a.label, a.is_default ? "sì" : "", a.address_line1, a.address_line2, a.address_line3, a.postal_code, a.city, a.region, countryName(a.country),
        ...tail,
      ].map(csvCell).join(";"));
    }
  }
  return "﻿" + lines.join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

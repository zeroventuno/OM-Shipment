import { requireSupabase } from "@/lib/supabase";
import i18n from "i18next";
import { countryLabel } from "@/modules/shipments/data/countries";

/*
 * Pedidos de envio.
 *
 * O formulário público (link aberto, sem login) só fala com as funções
 * request_form_* do banco, que conferem o token do link. A tela interna
 * (com login) lê as tabelas shipment_requests e customers direto.
 */

export interface Box {
  width: number;
  height: number;
  depth: number;
  weight: number;
}

export interface CustomerInput {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_line3?: string;
  postal_code?: string;
  city: string;
  region?: string;
  country: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
}

export interface CustomerOption {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface PublicRequest {
  id: string;
  created_at: string;
  customer: string;
  country: string | null;
  boxes: Box[];
  service_level: "standard" | "express";
  order_ref: string | null;
  invoice_value: number | null;
  insured_value: number | null;
  requested_by: string;
  status: "pending" | "shipped" | "cancelled";
  carrier: string | null;
  tracking_code: string | null;
  /** "request" = feito pelo formulário; "manual" = envio cadastrado na tela interna com agente. */
  source?: "request" | "manual";
  is_pickup?: boolean;
}

const normName = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Mesmo agente? "Érica" = "Erica Pedratscher" = "erica": compara sem acento e
 * maiúsculas; se um dos dois é só o primeiro nome, basta o primeiro nome bater.
 */
export function sameAgent(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [fx, fy] = [x.split(" "), y.split(" ")];
  return (fx.length === 1 || fy.length === 1) && fx[0] === fy[0];
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

// --- Formulário público ----------------------------------------------------

export const formInfo = (token: string) => rpc<{ name: string }>("request_form_info", { token });
export const formCustomers = (token: string) => rpc<CustomerOption[]>("request_form_customers", { token });
export const formCreateCustomer = (token: string, customer: CustomerInput) =>
  rpc<{ id: string; name: string; existed: boolean; address_id: string | null }>("request_form_create_customer", { token, customer });

/** Caixa padrão da Officine Mattio (medidas em cm, peso médio em kg). */
export interface BoxPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  avg_weight: number | null;
}
export const formBoxPresets = (token: string) => rpc<BoxPreset[]>("request_form_box_presets", { token });
export const formSubmit = (
  token: string,
  request: {
    customer_id: string; address_id?: string; boxes: Box[]; service_level: string; order_ref?: string; notes?: string; requested_by: string;
    invoice_value: number; insured_value: number;
  },
) => rpc<{ id: string }>("request_form_submit", { token, request });

/**
 * Valor digitado -> número. Aceita "1.250,50", "1250.5", "1.250" (mil e
 * duzentos e cinquenta, como se escreve na Itália) e "€ 980".
 * Vazio, negativo ou inválido -> null.
 */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // Os dois: o último é o separador decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Só pontos em grupos de 3: separador de milhar.
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}

export const formatMoney = (n: number | null | undefined, locale = "it") =>
  n == null ? "" : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);

/** Endereço de entrega (um cliente pode ter vários). */
export interface AddressInput {
  label?: string;
  address_line1: string;
  address_line2?: string;
  address_line3?: string;
  postal_code?: string;
  city: string;
  region?: string;
  country: string;
  contact_name?: string;
  phone?: string;
}
export interface CustomerAddress extends AddressInput {
  id: string;
  is_default: boolean;
}
export const formCustomerAddresses = (token: string, customerId: string) =>
  rpc<CustomerAddress[]>("request_form_customer_addresses", { token, customer_id: customerId });
export const formAddAddress = (token: string, customerId: string, address: AddressInput) =>
  rpc<{ id: string }>("request_form_add_address", { token, customer_id: customerId, address });
export const formList = (token: string) => rpc<PublicRequest[]>("request_form_list", { token });

// --- Tela interna ----------------------------------------------------------

export interface Customer {
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
}

export interface ShipmentRequest {
  id: string;
  address: (CustomerAddress & { phone: string | null }) | null;
  created_at: string;
  boxes: Box[];
  service_level: "standard" | "express";
  order_ref: string | null;
  invoice_value: number | null;
  insured_value: number | null;
  notes: string | null;
  requested_by: string;
  status: "pending" | "shipped" | "cancelled";
  shipment_id: string | null;
  customer: Customer;
  shipment: { tracking_code: string | null; selected_quote: { portal?: string; carrier?: string } | null } | null;
}

/** "My Parcel / TNT" a partir da cotação escolhida no envio. */
export const quoteCarrier = (q: { portal?: string; carrier?: string } | null | undefined) =>
  [q?.portal, q?.carrier].map((p) => (p || "").trim()).filter(Boolean).join(" / ") || null;

export const REQUESTS_QUERY_KEY = ["shipment_requests"];

export async function listRequests(): Promise<ShipmentRequest[]> {
  const { data, error } = await requireSupabase()
    .from("shipment_requests")
    .select("id, created_at, boxes, service_level, order_ref, notes, invoice_value, insured_value, requested_by, status, shipment_id, customer:customers(*), address:customer_addresses(*), shipment:shipments!shipment_id(tracking_code, selected_quote)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as ShipmentRequest[];
}

export async function getRequest(id: string): Promise<ShipmentRequest> {
  const { data, error } = await requireSupabase()
    .from("shipment_requests")
    .select("id, created_at, boxes, service_level, order_ref, notes, invoice_value, insured_value, requested_by, status, shipment_id, customer:customers(*), address:customer_addresses(*), shipment:shipments!shipment_id(tracking_code, selected_quote)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ShipmentRequest;
}

export async function setRequestStatus(id: string, status: ShipmentRequest["status"]): Promise<void> {
  const { error } = await requireSupabase().from("shipment_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function listCustomerAddresses(customerId: string): Promise<(CustomerAddress & { phone: string | null })[]> {
  const { data, error } = await requireSupabase()
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as (CustomerAddress & { phone: string | null })[];
}

/** Endereço em uma linha, para mostrar e copiar. */
/** Endereço numa linha; o país sai no idioma da tela (o banco guarda em português). */
export function formatAddress(c: Partial<Customer> | Partial<AddressInput>): string {
  const country = c.country ? countryLabel(c.country, i18n.language || "it") : null;
  return [c.address_line1, c.address_line2, c.address_line3, [c.postal_code, c.city].filter(Boolean).join(" "), c.region, country]
    .filter((part) => part && String(part).trim())
    .join(", ");
}

export const boxSummary = (b: Box) => `${b.width}×${b.height}×${b.depth} cm · ${b.weight} kg`;
export const totalWeight = (boxes: Box[]) => boxes.reduce((sum, b) => sum + Number(b.weight || 0), 0);

/** "My Parcel / TNT" → { portal: "My Parcel", courier: "TNT" } */
export function splitCarrier(carrier: string | null | undefined) {
  const parts = (carrier || "").split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { portal: null as string | null, courier: parts[0] || null };
  return { portal: parts.slice(0, -1).join(" / "), courier: parts[parts.length - 1] };
}

/**
 * Página de rastreio da transportadora; para as que não têm link direto
 * confiável (BRT, SDA, outras), o 17TRACK, que reconhece o código sozinho.
 */
export function trackingUrl(courier: string | null | undefined, code: string | null | undefined): string | null {
  const c = (code || "").replace(/\s+/g, "");
  if (!c) return null;
  const n = encodeURIComponent(c);
  switch ((courier || "").trim().toLowerCase()) {
    case "tnt": return `https://www.tnt.it/tracking/getTrack.html?wt=1&consigNos=${n}`;
    case "dhl": return `https://www.dhl.com/it-it/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`;
    case "ups": return `https://www.ups.com/track?loc=it_IT&tracknum=${n}`;
    case "fedex": return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "brt": return `https://vas.brt.it/vas/sped_det_show.hsm?referer=sped_numspe_par.htm&Nspediz=${n}`;
    default: return `https://t.17track.net/it#nums=${n}`;
  }
}

import { requireSupabase } from "@/lib/supabase";

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
  requested_by: string;
  status: "pending" | "shipped" | "cancelled";
  carrier: string | null;
  tracking_code: string | null;
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
  rpc<{ id: string; name: string }>("request_form_create_customer", { token, customer });
export const formSubmit = (
  token: string,
  request: { customer_id: string; boxes: Box[]; service_level: string; order_ref?: string; notes?: string; requested_by: string },
) => rpc<{ id: string }>("request_form_submit", { token, request });
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
  created_at: string;
  boxes: Box[];
  service_level: "standard" | "express";
  order_ref: string | null;
  notes: string | null;
  requested_by: string;
  status: "pending" | "shipped" | "cancelled";
  shipment_id: string | null;
  customer: Customer;
}

export const REQUESTS_QUERY_KEY = ["shipment_requests"];

export async function listRequests(): Promise<ShipmentRequest[]> {
  const { data, error } = await requireSupabase()
    .from("shipment_requests")
    .select("id, created_at, boxes, service_level, order_ref, notes, requested_by, status, shipment_id, customer:customers(*)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as ShipmentRequest[];
}

export async function getRequest(id: string): Promise<ShipmentRequest> {
  const { data, error } = await requireSupabase()
    .from("shipment_requests")
    .select("id, created_at, boxes, service_level, order_ref, notes, requested_by, status, shipment_id, customer:customers(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ShipmentRequest;
}

export async function setRequestStatus(id: string, status: ShipmentRequest["status"]): Promise<void> {
  const { error } = await requireSupabase().from("shipment_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Endereço em uma linha, para mostrar e copiar. */
export function formatAddress(c: Partial<Customer>): string {
  return [c.address_line1, c.address_line2, c.address_line3, [c.postal_code, c.city].filter(Boolean).join(" "), c.region, c.country]
    .filter((part) => part && String(part).trim())
    .join(", ");
}

export const boxSummary = (b: Box) => `${b.width}×${b.height}×${b.depth} cm · ${b.weight} kg`;
export const totalWeight = (boxes: Box[]) => boxes.reduce((sum, b) => sum + Number(b.weight || 0), 0);

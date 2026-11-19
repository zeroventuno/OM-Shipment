import { requireSupabase } from "@/lib/supabase";
import type { BoxPreset } from "@/modules/requests/api";
import { pickupPayload, type PickupDraft, type PickupReason } from "./intake";

/*
 * Pedidos de retirada de parceiros externos.
 * O formulário público só fala com as funções pickup_form_*; a fila interna
 * (com login) lê a tabela pickup_requests.
 */

export const PICKUP_REQUESTS_QUERY_KEY = ["pickup_requests"];

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const checkPickupLink = (token: string) => rpc<{ ok: boolean }>("pickup_form_check", { token });
export const pickupBoxPresets = (token: string) => rpc<BoxPreset[]>("pickup_form_box_presets", { token });
export const submitPickupRequest = (token: string, draft: PickupDraft, language: string) =>
  rpc<{ code: string | null }>("pickup_form_submit", { token, request: pickupPayload(draft, language) });

// --- Fila interna ----------------------------------------------------------

export interface PickupRequest {
  id: string;
  code: string | null;
  status: "new" | "converted" | "rejected";
  reason: PickupReason;
  shop_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  country: string;
  ready_from: string;
  opening_hours: string | null;
  reference: string | null;
  description: string;
  boxes: { width: number; height: number; depth: number; weight: number }[];
  notes: string | null;
  language: string | null;
  shipment_id: string | null;
  created_at: string;
}

export async function listPickupRequests(): Promise<PickupRequest[]> {
  const { data, error } = await requireSupabase().from("pickup_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PickupRequest[];
}

export async function getPickupRequest(id: string): Promise<PickupRequest> {
  const { data, error } = await requireSupabase().from("pickup_requests").select("*").eq("id", id).single();
  if (error) throw error;
  return data as PickupRequest;
}

export async function setPickupStatus(id: string, status: "new" | "rejected") {
  const { error } = await requireSupabase().from("pickup_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Endereço numa linha, para copiar no portal do corriere. */
export const pickupAddress = (r: Pick<PickupRequest, "address_line1" | "address_line2" | "postal_code" | "city" | "country">) =>
  [r.address_line1, r.address_line2, [r.postal_code, r.city].filter(Boolean).join(" "), r.country].filter(Boolean).join(", ");

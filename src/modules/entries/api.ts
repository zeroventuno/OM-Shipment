import { requireSupabase } from "@/lib/supabase";
import { parseMarks, type Mark } from "./marks";

/*
 * Controllo di entrata (OME-AA-NNN): a bike que chega na caixa. Quem tem
 * login lê e grava a tabela entry_checks direto; o código vem do banco.
 */

export const ENTRIES_KEY = ["entry_checks"];

/** Como a bike está montada (o quadro "Componenti" do papel). */
export const COMPONENT_KEYS = ["groupset", "cranks", "cassette", "wheels", "handlebar", "stem", "seatpost", "saddle", "pedals", "other"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

/** O que veio (ou não) na caixa. */
export const CONTENT_KEYS = ["wheels", "cassette", "saddle", "seatpost", "pedals", "handlebar", "axles", "charger"] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];
/** true = veio, false = falta, ausente = não conferido */
export type Contents = Partial<Record<ContentKey, boolean>>;

export interface EntryCheck {
  id: string;
  code: string | null;
  arrival_date: string;
  customer_id: string | null;
  customer_name: string;
  agent: string | null;
  bike_model: string | null;
  serial_number: string | null;
  size: string | null;
  box_damaged: boolean;
  reason: string | null;
  components: Partial<Record<ComponentKey, string>>;
  contents: Contents;
  marks: Mark[];
  notes: string | null;
  ticket_id: string | null;
  warranty_id: string | null;
  shipment_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EntryDraft = Omit<EntryCheck, "id" | "code" | "created_at" | "updated_at">;

export const emptyEntry = (today: string): EntryDraft => ({
  arrival_date: today, customer_id: null, customer_name: "", agent: "", bike_model: "", serial_number: "", size: "",
  box_damaged: false, reason: "", components: {}, contents: {}, marks: [], notes: "",
  ticket_id: null, warranty_id: null, shipment_id: null,
});

const db = () => requireSupabase();

function fromRow(r: Record<string, unknown>): EntryCheck {
  return {
    ...(r as unknown as EntryCheck),
    components: (r.components && typeof r.components === "object" ? r.components : {}) as EntryCheck["components"],
    contents: (r.contents && typeof r.contents === "object" ? r.contents : {}) as Contents,
    marks: parseMarks(r.marks),
  };
}

/** Texto vazio vira null; componentes vazios saem do objeto. */
export function entryPayload(d: EntryDraft) {
  const s = (v: string | null) => (v ?? "").trim() || null;
  const components = Object.fromEntries(Object.entries(d.components).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v));
  return {
    arrival_date: d.arrival_date, customer_id: d.customer_id, customer_name: d.customer_name.trim(),
    agent: s(d.agent), bike_model: s(d.bike_model), serial_number: s(d.serial_number), size: s(d.size),
    box_damaged: d.box_damaged, reason: s(d.reason), components, contents: d.contents, marks: d.marks, notes: s(d.notes),
    ticket_id: d.ticket_id, warranty_id: d.warranty_id, shipment_id: d.shipment_id,
  };
}

export async function listEntries(): Promise<EntryCheck[]> {
  const { data, error } = await db().from("entry_checks").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function getEntry(id: string): Promise<EntryCheck> {
  const { data, error } = await db().from("entry_checks").select("*").eq("id", id).single();
  if (error) throw error;
  return fromRow(data);
}

export async function saveEntry(id: string | null, draft: EntryDraft): Promise<EntryCheck> {
  const payload = entryPayload(draft);
  const q = id ? db().from("entry_checks").update(payload).eq("id", id) : db().from("entry_checks").insert(payload);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteEntry(id: string) {
  const { error } = await db().from("entry_checks").delete().eq("id", id);
  if (error) throw error;
}

export interface PickupShipment {
  id: string;
  order_id: string | null;
  customer_name: string | null;
  created_at: string;
  ticket_id: string | null;
  warranty_id: string | null;
}

/** Retiradas (envios is_pickup) para ligar a entrada, mais novas primeiro. */
export async function listPickupShipments(): Promise<PickupShipment[]> {
  const { data, error } = await db().from("shipments")
    .select("id, order_id, customer_name, created_at, ticket_id, warranty_id")
    .eq("is_pickup", true).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as PickupShipment[];
}

/** "2026-06-14" → "14/06/2026" */
export const itDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

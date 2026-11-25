import { requireSupabase } from "@/lib/supabase";
import type { AgendaEvent, DayPart, Employee, Leave, LeaveStatus, NameOrder, Sector, SectorInfo } from "./logic";

/*
 * Férias e agenda. Quem tem login lê e grava as tabelas direto; o link
 * pessoal do funcionário só fala com as funções ferie_form_*.
 */

export const FERIE_KEY = ["ferie"];
export const LEAVES_KEY = ["ferie", "leaves"];

export interface StaffEmployee extends Employee {
  email: string | null;
  link_token: string | null;
  active: boolean;
}

export interface StaffLeave extends Leave {
  note: string | null;
  response_note: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface StaffEvent extends AgendaEvent {
  notes: string | null;
}

export interface Van {
  id: string;
  name: string;
  plate: string | null;
  active: boolean;
  sort_order: number;
}

const db = () => requireSupabase();
const check = <T>({ data, error }: { data: T | null; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export const listEmployees = async () =>
  check(await db().from("employees").select("*").order("name")) as StaffEmployee[];
export const listLeaves = async () =>
  check(await db().from("leave_requests").select("*").order("start_date", { ascending: false })) as StaffLeave[];
export const listEvents = async () =>
  check(await db().from("agenda_events").select("*").order("start_date")) as StaffEvent[];
export const listSectors = async () =>
  check(await db().from("sectors").select("*").order("sort_order").order("name")) as SectorInfo[];

export async function saveSector(s: SectorInfo, isNew: boolean) {
  const row = { name: s.name.trim(), sort_order: s.sort_order, active: s.active };
  check(await (isNew ? db().from("sectors").insert({ id: s.id, ...row }) : db().from("sectors").update(row).eq("id", s.id)));
}

/** Só apaga setor sem ninguém nem evento ligado (o banco recusa os outros). */
export const deleteSector = async (id: string) => check(await db().from("sectors").delete().eq("id", id));

export async function getNameOrder(): Promise<NameOrder> {
  const { data, error } = await db().from("app_settings").select("value").eq("key", "ferie.name_order").maybeSingle();
  if (error) throw error;
  return data?.value === "last_first" ? "last_first" : "first_last";
}

export const setNameOrder = async (order: NameOrder) =>
  check(await db().from("app_settings").upsert({ key: "ferie.name_order", value: order, updated_at: new Date().toISOString() }));

export const listVans = async () =>
  check(await db().from("vans").select("*").order("sort_order").order("name")) as Van[];

export async function saveEmployee(e: Partial<StaffEmployee> & { first_name: string; last_name: string; primary_sector: Sector }) {
  const first_name = e.first_name.trim(), last_name = e.last_name.trim();
  const row = {
    first_name: first_name || null, last_name: last_name || null,
    // name fica sempre "Nome Sobrenome" (busca e telas que não separam)
    name: [first_name, last_name].filter(Boolean).join(" "), email: e.email?.trim() || null, primary_sector: e.primary_sector,
    secondary_sector: e.secondary_sector || null, active: e.active ?? true,
    ...(e.link_token !== undefined ? { link_token: e.link_token } : {}),
  };
  const q = e.id ? db().from("employees").update(row).eq("id", e.id) : db().from("employees").insert(row);
  check(await q);
}

/** Apaga a pessoa e os pedidos de férias dela; some também dos eventos da agenda. */
export async function deleteEmployee(id: string) {
  check(await db().from("employees").delete().eq("id", id));
  const { data } = await db().from("agenda_events").select("id, employee_ids").contains("employee_ids", [id]);
  for (const ev of (data ?? []) as { id: string; employee_ids: string[] }[]) {
    check(await db().from("agenda_events").update({ employee_ids: ev.employee_ids.filter((x) => x !== id) }).eq("id", ev.id));
  }
}

export const setEmployeeToken = async (id: string, link_token: string | null) =>
  check(await db().from("employees").update({ link_token }).eq("id", id));

export async function decideLeave(id: string, decision:
  | { status: Extract<LeaveStatus, "approved" | "rejected" | "pending">; note?: string }
  | { status: "proposed"; start: string; end: string; note?: string }) {
  const { data: { user } } = await db().auth.getUser();
  const row: Record<string, unknown> = {
    status: decision.status, response_note: decision.note?.trim() || null,
    decided_by: decision.status === "pending" ? null : user?.id ?? null,
    decided_at: decision.status === "pending" ? null : new Date().toISOString(),
    proposed_start: decision.status === "proposed" ? decision.start : null,
    proposed_end: decision.status === "proposed" ? decision.end : null,
  };
  check(await db().from("leave_requests").update(row).eq("id", id));
}

/** Pedido lançado pelo escritório (já aprovado). */
export async function addLeave(l: { employee_id: string; start_date: string; end_date: string; part: DayPart; note?: string }) {
  const { data: { user } } = await db().auth.getUser();
  check(await db().from("leave_requests").insert({
    ...l, note: l.note?.trim() || null, status: "approved", decided_by: user?.id ?? null, decided_at: new Date().toISOString(),
  }));
}

export async function saveEvent(e: Omit<StaffEvent, "id"> & { id?: string }) {
  const { data: { user } } = await db().auth.getUser();
  const row = {
    kind: e.kind, title: e.title.trim(), start_date: e.start_date, end_date: e.end_date,
    start_time: e.start_time || null, end_time: e.end_time || null,
    sector: e.kind === "block" || e.kind === "meeting" ? e.sector || null : null,
    employee_ids: e.kind === "block" || e.kind === "van" ? [] : e.employee_ids,
    van_id: e.kind === "van" ? e.van_id || null : null,
    notes: e.notes?.trim() || null,
  };
  const q = e.id ? db().from("agenda_events").update(row).eq("id", e.id)
    : db().from("agenda_events").insert({ ...row, created_by: user?.id ?? null });
  check(await q);
}

export const deleteEvent = async (id: string) => check(await db().from("agenda_events").delete().eq("id", id));

export async function saveVan(v: Partial<Van> & { name: string }) {
  const row = { name: v.name.trim(), plate: v.plate?.trim() || null, active: v.active ?? true, sort_order: v.sort_order ?? 0 };
  check(await (v.id ? db().from("vans").update(row).eq("id", v.id) : db().from("vans").insert(row)));
}

// --- Link pessoal -----------------------------------------------------------

export interface FormRequest extends Leave {
  note: string | null;
  response_note: string | null;
  created_at: string;
}

export interface FormData {
  me: Employee;
  name_order: NameOrder;
  sectors: SectorInfo[];
  requests: FormRequest[];
  employees: Employee[];
  leaves: Leave[];
  events: AgendaEvent[];
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const ferieFormData = (token: string) => rpc<FormData>("ferie_form_data", { token });
export const ferieFormSubmit = (token: string, r: { start_date: string; end_date: string; part: DayPart; note: string }) =>
  rpc<{ id: string }>("ferie_form_submit", { token, request: r });
export const ferieFormCancel = (token: string, id: string) => rpc("ferie_form_cancel", { token, request_id: id });
export const ferieFormAnswer = (token: string, id: string, accept: boolean) =>
  rpc("ferie_form_answer", { token, request_id: id, accept });

export const ferieLink = (token: string) => `${window.location.origin}/ferie/${token}`;

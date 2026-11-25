import { requireSupabase } from "@/lib/supabase";
import type { Ticket, Warranty } from "@/modules/schema";
import type { ShipmentRequest } from "@/modules/requests/api";
import type { PickupRequest } from "@/modules/pickups/api";
import type { StaffEmployee, StaffLeave } from "@/modules/ferie/api";

/*
 * To Do da pílula do canto. Os itens escritos à mão ficam na tabela todos
 * (cada login vê só os seus). Os automáticos são calculados aqui a partir das
 * filas do sistema e somem sozinhos quando o pedido é resolvido.
 */

export const TODOS_KEY = ["todos"];

export interface Todo {
  id: string;
  title: string;
  due_date: string | null;
  done_at: string | null;
  created_at: string;
}

const db = () => requireSupabase();

export async function listTodos(): Promise<Todo[]> {
  // feitos só dos últimos 14 dias, para a lista não crescer sem fim
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await db().from("todos").select("id, title, due_date, done_at, created_at")
    .or(`done_at.is.null,done_at.gte.${since}`).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Todo[];
}

export async function addTodo(title: string, due_date: string | null) {
  const { error } = await db().from("todos").insert({ title: title.trim(), due_date });
  if (error) throw error;
}

export async function setTodoDone(id: string, done: boolean) {
  const { error } = await db().from("todos").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function deleteTodo(id: string) {
  const { error } = await db().from("todos").delete().eq("id", id);
  if (error) throw error;
}

// --- Itens automáticos ------------------------------------------------------

export type AutoKind = "request" | "pickup" | "ticket" | "warranty" | "leave";

export interface AutoItem {
  key: string;
  kind: AutoKind;
  title: string;
  sub?: string;
  to: string;
  /** dias parado (assistências e garantias) */
  days?: number;
}

export function autoItems(src: {
  requests?: ShipmentRequest[];
  pickups?: PickupRequest[];
  /** só as paradas, com os dias */
  tickets?: { item: Ticket; days: number }[];
  warranties?: { item: Warranty; days: number }[];
  leaves?: StaffLeave[];
  employees?: StaffEmployee[];
}): AutoItem[] {
  const out: AutoItem[] = [];
  for (const r of src.requests ?? []) {
    if (r.status !== "pending") continue;
    out.push({ key: `r${r.id}`, kind: "request", title: r.customer?.name ?? "—", sub: r.order_ref ?? r.requested_by, to: "/shipments/requests" });
  }
  for (const p of src.pickups ?? []) {
    if (p.status !== "new") continue;
    out.push({ key: `p${p.id}`, kind: "pickup", title: p.shop_name, sub: [p.code, p.city].filter(Boolean).join(" · "), to: "/shipments/pickups" });
  }
  for (const { item: t, days } of [...(src.tickets ?? [])].sort((a, b) => b.days - a.days)) {
    out.push({ key: `t${t.id}`, kind: "ticket", title: [t.code, t.clientName].filter(Boolean).join(" · "), sub: [t.component, t.phase].filter(Boolean).join(" · "), to: `/assistance/${t.id}`, days });
  }
  for (const { item: w, days } of [...(src.warranties ?? [])].sort((a, b) => b.days - a.days)) {
    out.push({ key: `w${w.id}`, kind: "warranty", title: w.customerName, sub: [w.bikeModel, w.status].filter(Boolean).join(" · "), to: `/warranties/${w.id}`, days });
  }
  for (const l of src.leaves ?? []) {
    if (l.status !== "pending") continue;
    const name = src.employees?.find((e) => e.id === l.employee_id)?.name ?? "—";
    out.push({ key: `l${l.id}`, kind: "leave", title: name, sub: l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`, to: "/ferie" });
  }
  return out;
}

export const AUTO_ORDER: AutoKind[] = ["request", "pickup", "leave", "ticket", "warranty"];

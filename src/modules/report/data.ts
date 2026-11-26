import { requireSupabase } from "@/lib/supabase";
import type { NameRow, ReportInput, RequestRow, ShipmentRow, TicketRow, WarrantyRow } from "./compute";

/**
 * Carica l'anno scelto e il precedente (per i confronti), solo con le colonne
 * che servono al report. Le date sono confrontate con un giorno di margine
 * (fuso orario di Roma): il filtro esatto per anno lo fa compute.ts.
 */

const PAGE = 1000;

const SHIPMENT_COLS =
  "id, created_at, order_type, customer_name, quantity, destination_country, customer_payment, tracking_code, selected_quote, savings, customer_cost_pickup, ticket_id, warranty_id, service_level, agent, request_id, channel";
const TICKET_COLS = "id, created_at, brand, phase, approval_status, completion_date, shipping_cost";
const WARRANTY_COLS = "id, created_at, start_date, process_type, status, solution, producer, value, shipping_cost, history, updated_at, agent";
const REQUEST_COLS = "id, created_at, status, service_level, invoice_value, insured_value, shipment_id";

type Filter = { col: string; gte?: string; lt?: string; ids?: string[] };

/** legge tutte le righe a pagine da 1000 (il limite di PostgREST) */
async function readAll<T>(table: string, cols: string, f: Filter): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = requireSupabase().from(table).select(cols);
    if (f.gte) q = q.gte(f.col, f.gte);
    if (f.lt) q = q.lt(f.col, f.lt);
    if (f.ids) q = q.in(f.col, f.ids);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function loadReportData(year: number): Promise<ReportInput> {
  const from = `${year - 2}-12-31`;
  const to = `${year + 1}-01-02`;
  const range = { gte: from, lt: to };
  const [shipments, tickets, warrantiesByCreated, warrantiesByStart, requests, olderNames] = await Promise.all([
    readAll<ShipmentRow>("shipments", SHIPMENT_COLS, { col: "created_at", ...range }),
    readAll<TicketRow>("tickets", TICKET_COLS, { col: "created_at", ...range }),
    readAll<WarrantyRow>("warranties", WARRANTY_COLS, { col: "created_at", ...range }),
    // la garanzia conta dalla data d'inizio, che può essere precedente alla creazione
    readAll<WarrantyRow>("warranties", WARRANTY_COLS, { col: "start_date", ...range }),
    readAll<RequestRow>("shipment_requests", REQUEST_COLS, { col: "created_at", gte: `${year - 1}-12-31`, lt: to }),
    readAll<NameRow>("shipments", "id, customer_name, created_at", { col: "created_at", lt: `${year - 1}-01-02` }),
  ]);

  const warranties = new Map<string, WarrantyRow>();
  for (const w of [...warrantiesByCreated, ...warrantiesByStart]) warranties.set(w.id, w);

  // le spedizioni delle richieste che cadono fuori dai due anni caricati
  const known = new Set(shipments.map((s) => s.id));
  const missing = Array.from(new Set(requests.map((r) => r.shipment_id).filter((id): id is string => !!id && !known.has(id))));
  const requestShipments = missing.length
    ? await readAll<{ id: string; created_at: string }>("shipments", "id, created_at", { col: "id", ids: missing.slice(0, 200) })
    : [];

  return { shipments, tickets, warranties: Array.from(warranties.values()), requests, olderNames, requestShipments };
}

/** gli anni che hanno dati: dalla prima spedizione fino a oggi */
export async function loadReportYears(currentYear: number): Promise<number[]> {
  const { data, error } = await requireSupabase()
    .from("shipments")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const first = data?.[0]?.created_at ? Number(String(data[0].created_at).slice(0, 4)) : currentYear;
  const years: number[] = [];
  for (let y = currentYear; y >= Math.min(first, currentYear); y--) years.push(y);
  return years;
}

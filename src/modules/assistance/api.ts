import { requireSupabase } from "@/lib/supabase";
import type { InsertTicket, Ticket } from "../schema";
import { createdEntry, diffHistory, emptyToNull, fromRow, toRow } from "../records";
import { stageAge } from "../progress";

const TABLE = "tickets";
const DATE_COLUMNS = ["shippingDate", "completionDate", "createdAt", "updatedAt"] as const;
const OPTIONAL = [
    "agent", "serialNumber", "problem", "protocolNumber", "approvalStatus",
    "shippingDate", "trackingNumber", "shippingCompany", "completionDate",
] as const;

const parse = (row: Record<string, unknown>) => fromRow<Ticket>(row, DATE_COLUMNS);

function normalize(data: Partial<InsertTicket>) {
    return emptyToNull(data as Record<string, unknown>, OPTIONAL as readonly string[]);
}

export async function listTickets(): Promise<Ticket[]> {
    const { data, error } = await requireSupabase()
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(parse);
}

export async function createTicket(input: InsertTicket): Promise<Ticket> {
    const row = toRow({ ...normalize(input), history: [createdEntry("Ticket")] });
    const { data, error } = await requireSupabase().from(TABLE).insert(row).select().single();
    if (error) throw error;
    return parse(data);
}

export async function updateTicket(current: Ticket, input: Partial<InsertTicket>): Promise<Ticket> {
    const update = normalize(input);
    const history = [
        ...(current.history ?? []),
        ...diffHistory(current as unknown as Record<string, unknown>, update, ["shippingDate", "completionDate"]),
    ];
    const { data, error } = await requireSupabase()
        .from(TABLE)
        .update(toRow({ ...update, history }))
        .eq("id", current.id)
        .select()
        .single();
    if (error) throw error;
    return parse(data);
}

export async function deleteTicket(id: string): Promise<void> {
    const { error } = await requireSupabase().from(TABLE).delete().eq("id", id);
    if (error) throw error;
}

// --- Uso nas telas ---------------------------------------------------------

export const TICKETS_QUERY_KEY = ["tickets"];
export const ticketsQuery = { queryKey: TICKETS_QUERY_KEY, queryFn: listTickets };

export async function getTicket(id: string): Promise<Ticket> {
    const { data, error } = await requireSupabase().from(TABLE).select("*").eq("id", id).single();
    if (error) throw error;
    return parse(data);
}

/** Há quanto tempo o ticket está na fase atual. */
export function ticketAge(ticket: Ticket, now = new Date()) {
    return stageAge(ticket.history, ["phase", "Fase"], ticket.createdAt, ticket.phase === "Completato", now);
}

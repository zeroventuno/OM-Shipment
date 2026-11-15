import { requireSupabase } from "@/lib/supabase";
import type { InsertWarranty, Warranty } from "../schema";
import { createdEntry, diffHistory, emptyToNull, fromRow, toRow } from "../records";
import { stageAge } from "../progress";

const TABLE = "warranties";
export const WARRANTY_IMAGES_BUCKET = "warranty-images";
const DATE_COLUMNS = ["startDate", "createdAt", "updatedAt", "shippingDate"] as const;
const OPTIONAL = [
    "observation", "paintDetails", "componentsDescription", "solution", "producer",
    "newSerialNumber", "orderNumber", "value", "invoice",
] as const;

const parse = (row: Record<string, unknown>) => fromRow<Warranty>(row, DATE_COLUMNS);

function normalize(data: Partial<InsertWarranty>) {
    const out = emptyToNull(data as Record<string, unknown>, OPTIONAL as readonly string[]);
    // Sem data de início o banco usa a data de hoje (default da coluna).
    if (!out.startDate) delete out.startDate;
    return out;
}

export async function listWarranties(): Promise<Warranty[]> {
    const { data, error } = await requireSupabase()
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(parse);
}

/** O número de protocolo (OMW-AA-NNN) é gerado pelo banco, num trigger. */
export async function createWarranty(input: InsertWarranty): Promise<Warranty> {
    const row = toRow({ ...normalize(input), status: "In attesa", history: [createdEntry("Garanzia")] });
    const { data, error } = await requireSupabase().from(TABLE).insert(row).select().single();
    if (error) throw error;
    return parse(data);
}

export async function updateWarranty(current: Warranty, input: Partial<InsertWarranty>): Promise<Warranty> {
    const update = normalize(input);
    const history = [
        ...(current.history ?? []),
        ...diffHistory(current as unknown as Record<string, unknown>, update, ["startDate"]),
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

export async function deleteWarranty(id: string): Promise<void> {
    const { error } = await requireSupabase().from(TABLE).delete().eq("id", id);
    if (error) throw error;
}

/** Envia uma foto para o bucket público e devolve a URL pública. */
export async function uploadWarrantyImage(file: File | Blob, extension: string): Promise<string> {
    const supabase = requireSupabase();
    const path = `${Date.now()}-${Math.random().toString(36).substring(2)}.${extension}`;
    const { error } = await supabase.storage.from(WARRANTY_IMAGES_BUCKET).upload(path, file);
    if (error) throw error;
    return supabase.storage.from(WARRANTY_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

// --- Uso nas telas ---------------------------------------------------------

export const WARRANTIES_QUERY_KEY = ["warranties"];
export const warrantiesQuery = { queryKey: WARRANTIES_QUERY_KEY, queryFn: listWarranties };

export async function getWarranty(id: string): Promise<Warranty> {
    const { data, error } = await requireSupabase().from(TABLE).select("*").eq("id", id).single();
    if (error) throw error;
    return parse(data);
}

/** Há quanto tempo a garantia está no status atual. */
export function warrantyAge(warranty: Warranty, now = new Date()) {
    return stageAge(warranty.history, ["status", "Stato"], warranty.startDate ?? warranty.createdAt, warranty.status === "Completato", now);
}

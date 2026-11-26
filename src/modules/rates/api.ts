import { requireSupabase } from "@/lib/supabase";
import type { RateCardData } from "./calc";

/*
 * Listini corrieri: a tabela carrier_rate_cards (migration
 * 20261126260000_carrier_rate_cards) e os arquivos originais no bucket
 * privado rate-cards. A tabela padrão (tariff) vem dos leitores em
 * scripts/rates; um arquivo novo fica "da convertire" até ser lido.
 */

export const RATES_KEY = ["rate-cards"];
const BUCKET = "rate-cards";

export type RateStatus = "active" | "evaluation" | "archived";
export interface RateFile { path: string; name: string; size: number }
export interface RateCard {
  id: string; carrier: string; name: string; status: RateStatus; valid_from: string | null; notes: string | null;
  files: RateFile[]; tariff: RateCardData | null; created_at: string; updated_at: string;
}

const db = () => requireSupabase();

export async function listRateCards(): Promise<RateCard[]> {
  const { data, error } = await db().from("carrier_rate_cards").select("*").order("status").order("carrier");
  if (error) throw error;
  return (data ?? []) as RateCard[];
}

const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");

async function uploadFiles(cardId: string, files: File[]): Promise<RateFile[]> {
  const out: RateFile[] = [];
  for (const f of files) {
    const path = `${cardId}/${Date.now()}-${safeName(f.name)}`;
    const { error } = await db().storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
    if (error) throw error;
    out.push({ path, name: f.name, size: f.size });
  }
  return out;
}

/** Listino novo: cria a linha e sobe os arquivos. Fica "da convertire" (sem tariff). */
export async function createRateCard(input: { carrier: string; name: string; status: RateStatus; valid_from: string | null; notes: string }, files: File[]) {
  const { data, error } = await db().from("carrier_rate_cards")
    .insert({ carrier: input.carrier.trim(), name: input.name.trim(), status: input.status, valid_from: input.valid_from || null, notes: input.notes.trim() || null })
    .select().single();
  if (error) throw error;
  if (files.length) await addRateFiles(data as RateCard, files);
}

export async function addRateFiles(card: RateCard, files: File[]) {
  const uploaded = await uploadFiles(card.id, files);
  const { error } = await db().from("carrier_rate_cards").update({ files: [...card.files, ...uploaded] }).eq("id", card.id);
  if (error) throw error;
}

export async function setRateStatus(id: string, status: RateStatus) {
  const { error } = await db().from("carrier_rate_cards").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Link temporário (10 min) para abrir o arquivo original. */
export async function rateFileUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

import { requireSupabase } from "@/lib/supabase";
import type { EmergencyContact, ProfileField } from "./text";

/*
 * Chips NFC. O atleta não tem login: fala com as funções nfc_* usando o próprio
 * link pessoal (token). A equipe usa as funções nfc_admin_*, que exigem login.
 */

export const NFC_TAGS_QUERY_KEY = ["nfc_tags"];
const TOKEN_KEY = "om-nfc-token";

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface NfcProfile {
  name: string;
  email: string;
  phone: string;
  blood_type: string;
  allergies: string;
  conditions: string;
  medications: string;
  emergency_contacts: EmergencyContact[];
  notes: string;
  visibility: Record<ProfileField, boolean>;
  language?: string;
}

export interface NfcMe extends Partial<Omit<NfcProfile, "visibility">> {
  visibility: Partial<Record<ProfileField, boolean>>;
  consent_at: string;
  tags: { code: string; status: "active" | "disabled" }[];
}

export const claimTag = (code: string, profile: NfcProfile & { privacy_accepted: boolean }) =>
  rpc<{ token: string }>("nfc_claim", { code, profile });
export const getMe = (token: string) => rpc<NfcMe>("nfc_me", { token });
export const saveMe = (token: string, profile: NfcProfile) => rpc<NfcMe>("nfc_me_save", { token, profile });
export const blockTag = (token: string, code: string, blocked: boolean) => rpc<NfcMe>("nfc_me_block", { token, code, blocked });
export const deleteMe = (token: string) => rpc<{ ok: boolean }>("nfc_me_delete", { token });

/** O link pessoal fica também no aparelho, para abrir /nfc/profilo sem ele. */
export function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // aba privada: só o link serve
  }
}
export function rememberedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// --- Equipe ---------------------------------------------------------------

export type TagStatus = "blank" | "written" | "active" | "disabled";

export interface NfcTag {
  code: string;
  status: TagStatus;
  kind: string;
  product_ref: string | null;
  chip_uid: string | null;
  locked: boolean;
  written_at: string | null;
  created_at: string;
  has_owner: boolean;
  owner_name: string | null;
  owner_email: string | null;
  scans: number;
  last_scan: string | null;
}

export const listTags = () => rpc<NfcTag[]>("nfc_admin_tags");
export const generateTags = (howMany: number, productRef: string) =>
  rpc<string[]>("nfc_admin_generate", { how_many: howMany, product_ref: productRef || null });
export const markWritten = (code: string, chipUid: string | null, locked: boolean) =>
  rpc<{ ok: boolean }>("nfc_admin_written", { code, chip_uid: chipUid, locked });
export const tagAction = (code: string, action: "block" | "unblock" | "unlink") => rpc<{ ok: boolean }>("nfc_admin_action", { code, action });
export const newOwnerLink = (code: string) => rpc<{ token: string }>("nfc_admin_owner_link", { code });

// Web NFC (só Chrome no Android, em HTTPS).
interface NdefReadingEvent extends Event { serialNumber: string }
interface NdefReader {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: { records: { recordType: string; data: string }[] }, options?: { signal?: AbortSignal }): Promise<void>;
  makeReadOnly(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((e: NdefReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
}
declare global {
  interface Window { NDEFReader?: new () => NdefReader }
}

export const canWriteNfc = () => typeof window !== "undefined" && "NDEFReader" in window;

/**
 * Lê o número de série do chip encostado e grava o link. No piloto o chip NÃO é
 * travado (lock = false), para poder ser regravado.
 */
export async function writeChip(url: string, lock: boolean, signal: AbortSignal): Promise<string | null> {
  if (!window.NDEFReader) throw new Error("Web NFC");
  const ndef = new window.NDEFReader();
  const serial = await new Promise<string | null>((resolve, reject) => {
    const scanCtrl = new AbortController();
    signal.addEventListener("abort", () => { scanCtrl.abort(); reject(new DOMException("Aborted", "AbortError")); });
    ndef.onreading = (e) => { scanCtrl.abort(); resolve(e.serialNumber || null); };
    ndef.onreadingerror = () => { scanCtrl.abort(); resolve(null); };
    ndef.scan({ signal: scanCtrl.signal }).catch(reject);
  });
  await ndef.write({ records: [{ recordType: "url", data: url }] }, { signal });
  if (lock) await ndef.makeReadOnly({ signal });
  return serial;
}

import { requireSupabase } from "@/lib/supabase";

/** Referente di un fornitore o partner (tabella partner_contacts). */
export interface PartnerContact {
  id: string;
  company: string;
  category: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type PartnerContactInput = Pick<PartnerContact, "company" | "category" | "name" | "role" | "phone" | "mobile" | "email" | "notes">;

export const CONTACTS_KEY = ["partner_contacts"] as const;

/** Categorias sugeridas no formulário (o campo aceita texto livre). */
export const CATEGORY_SUGGESTIONS = ["Corriere", "Portale spedizioni", "Dogana / spedizioniere", "Imballaggi", "Assicurazione", "Altro"];

export async function listContacts(): Promise<PartnerContact[]> {
  const { data, error } = await requireSupabase()
    .from("partner_contacts")
    .select("*")
    .eq("active", true)
    .order("company")
    .order("name");
  if (error) throw error;
  return data as PartnerContact[];
}

const tidy = (v: string | null | undefined) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
};

/** Limpa os campos antes de gravar (espaços, e-mail em minúsculas). */
export function cleanContact(input: PartnerContactInput): PartnerContactInput {
  return {
    company: tidy(input.company) ?? "",
    category: tidy(input.category),
    name: tidy(input.name) ?? "",
    role: tidy(input.role),
    phone: tidy(input.phone),
    mobile: tidy(input.mobile),
    email: tidy(input.email)?.toLowerCase() ?? null,
    notes: input.notes?.trim() || null,
  };
}

export async function saveContact(id: string | null, input: PartnerContactInput) {
  const row = { ...cleanContact(input), updated_at: new Date().toISOString() };
  const db = requireSupabase().from("partner_contacts");
  const { error } = id ? await db.update(row).eq("id", id) : await db.insert(row);
  if (error) throw error;
}

/** Remover só desativa: o contato sai da lista mas continua no banco. */
export async function archiveContact(id: string) {
  const { error } = await requireSupabase()
    .from("partner_contacts")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

/** Escapa texto para vCard 3.0 (vírgula, ponto e vírgula, barra, quebra de linha). */
const vcText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/**
 * Agenda em vCard 3.0: abre no celular (iPhone/Android), no Outlook e no
 * Google Contatos. Um cartão por pessoa, com empresa, função e notas.
 */
export function buildVCards(contacts: PartnerContact[]): string {
  return contacts.map((c) => {
    const parts = c.name.split(" ");
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : c.name;
    const note = [c.category, c.notes].filter(Boolean).join(" — ");
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${vcText(last)};${vcText(first)};;;`,
      `FN:${vcText(c.name)}`,
      `ORG:${vcText(c.company)}`,
      c.role && `TITLE:${vcText(c.role)}`,
      c.phone && `TEL;TYPE=WORK,VOICE:${c.phone}`,
      c.mobile && `TEL;TYPE=CELL:${c.mobile}`,
      c.email && `EMAIL;TYPE=INTERNET,WORK:${c.email}`,
      note && `NOTE:${vcText(note)}`,
      "END:VCARD",
    ];
    return lines.filter(Boolean).join("\r\n");
  }).join("\r\n") + "\r\n";
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CONTACTS_CSV_HEADERS = ["Azienda", "Categoria", "Nome", "Ruolo", "Telefono", "Cellulare", "Email", "Note"];

/** CSV com ";" e BOM, para o Excel em italiano. */
export function buildContactsCsv(contacts: PartnerContact[]): string {
  const lines = [CONTACTS_CSV_HEADERS.join(";")];
  for (const c of contacts) lines.push([c.company, c.category, c.name, c.role, c.phone, c.mobile, c.email, c.notes].map(csvCell).join(";"));
  return "\uFEFF" + lines.join("\r\n");
}

import { leaveHours, type DayPart, type LeaveStatus } from "./logic";

/*
 * Aviso da resposta pelo WhatsApp: abre o app com a mensagem pronta para a
 * pessoa, em italiano (a equipe é italiana). Sem número, não há botão.
 */

/** Número para o wa.me: só dígitos, com código do país (celular italiano sem código ganha 39). */
export function waNumber(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^3\d{8,9}$/.test(d)) d = `39${d}`;
  d = d.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

const itDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const span = (s: string, e: string) => (s === e ? `il ${itDate(s)}` : `dal ${itDate(s)} al ${itDate(e)}`);

export interface WaLeave {
  status: LeaveStatus;
  start_date: string;
  end_date: string;
  part: DayPart;
  hours?: number | string | null;
  proposed_start?: string | null;
  proposed_end?: string | null;
  response_note?: string | null;
}

/** Mensagem da resposta; null quando não há o que avisar (pendente ou cancelado). */
export function waMessage(l: WaLeave, firstName: string, link: string | null): string | null {
  const h = leaveHours(l);
  const what = h ? `il permesso di ${String(h).replace(".", ",")} ${h === 1 ? "ora" : "ore"} (${l.part === "am" ? "mattina" : "pomeriggio"}) ${span(l.start_date, l.end_date)}`
    : l.part !== "full" ? `la mezza giornata (${l.part === "am" ? "mattina" : "pomeriggio"}) ${span(l.start_date, l.end_date)}`
      : `le ferie ${span(l.start_date, l.end_date)}`;
  let body: string;
  if (l.status === "approved") body = `${what}: approvato ✅`;
  else if (l.status === "rejected") body = `${what}: purtroppo non è stato possibile approvare.`;
  else if (l.status === "proposed" && l.proposed_start && l.proposed_end) body = `per ${what} ti proponiamo invece ${span(l.proposed_start, l.proposed_end)}. Puoi accettare o rifiutare dal tuo link.`;
  else return null;
  const lines = [`Ciao ${firstName.trim() || ""}`.trim() + ",", body.charAt(0).toUpperCase() + body.slice(1)];
  if (l.response_note?.trim()) lines.push(`Nota: ${l.response_note.trim()}`);
  if (link) lines.push(`Dettagli: ${link}`);
  lines.push("Officine Mattio");
  return lines.join("\n");
}

export const waUrl = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

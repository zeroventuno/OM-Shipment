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

/** Convite com o link pessoal (texto do Cristiano, atualizado com o hub e a aba Agenda em 26/11/2026), já com o nome e o link da pessoa. */
export function waInviteMessage(firstName: string, link: string): string {
  return [
    `Ciao ${firstName.trim()},`.replace(" ,", ","),
    "",
    "questo è il tuo link personale per OM Service, il gestionale di Officine Mattio:",
    link,
    "",
    "Da qui chiedi tutto all'ufficio, in un posto solo:",
    "",
    "Agenda",
    "- il riepilogo dei tuoi prossimi impegni, trasferte, furgoni e ferie;",
    "- per i commerciali, anche i tuoi numeri: spedizioni, saldo, garanzie e assistenze.",
    "",
    "Ferie e agenda",
    "- chiedere ferie o permessi, anche a ore (mattina o pomeriggio);",
    "- vedere lo stato delle tue richieste: in attesa, approvate, rifiutate o con un'altra data proposta (che puoi accettare o rifiutare);",
    "- segnare trasferte e riunioni esterne, anche con i colleghi che vengono con te;",
    "- prenotare un furgone, anche insieme alla trasferta;",
    "- vedere la mappa della squadra, per capire chi è fuori e quando.",
    "",
    "Spedizione o ritiro",
    "- chiedere una spedizione a un cliente o un ritiro da un negozio o cliente: sei già indicato come agente, non serve scrivere il nome.",
    "",
    "Assistenza o garanzia",
    "- aprire una richiesta di assistenza o garanzia per un cliente, con foto e scontrino.",
    "",
    "Le mie richieste",
    "- seguire tutto quello che hai chiesto, con lo stato e il tracking delle spedizioni.",
    "",
    "Non serve nessuna password: il link è solo tuo e ti riconosce. Per questo non inoltrarlo a nessuno. Se pensi che l'abbia visto qualcun altro, dimmelo e te ne creo uno nuovo.",
    "",
    "Consiglio: aprilo sul telefono e aggiungilo alla schermata Home. Su iPhone: Condividi → \"Aggiungi alla schermata Home\". Così si apre come un'app.",
    "",
    "Grazie!",
    "Officine Mattio",
  ].join("\n");
}

/** Sem número: o WhatsApp abre a lista de contatos com a mensagem pronta. */
export const waShareUrl = (number: string | null, text: string) =>
  number ? waUrl(number, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;

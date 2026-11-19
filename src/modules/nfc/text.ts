/*
 * Chips NFC: textos das páginas públicas (página do chip e cartão do atleta),
 * em italiano e inglês, e as regras puras que as duas usam.
 * Fica sem React para a página do chip carregar leve.
 */

export const NFC_LANGUAGES = ["it", "en"] as const;
export type NfcLanguage = (typeof NFC_LANGUAGES)[number];

export function nfcLanguage(browser: readonly string[]): NfcLanguage {
  for (const value of browser) {
    const code = value.slice(0, 2).toLowerCase();
    if ((NFC_LANGUAGES as readonly string[]).includes(code)) return code as NfcLanguage;
  }
  return "en";
}

/** Campos que o atleta pode mostrar a quem encostar o celular, na ordem do cartão. */
export const PROFILE_FIELDS = ["name", "blood_type", "emergency_contacts", "allergies", "conditions", "medications", "phone", "notes"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Visíveis por padrão: nome e contatos de emergência. */
export const DEFAULT_VISIBILITY: Record<ProfileField, boolean> = {
  name: true, emergency_contacts: true, blood_type: false, allergies: false,
  conditions: false, medications: false, phone: false, notes: false,
};

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"] as const;

/** "8 caracteres base62" do link /t/<code>. */
export const isTagCode = (code: string | undefined | null): code is string => /^[A-Za-z0-9]{8}$/.test(code ?? "");

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

/** Número para o link tel: (só dígitos e o + inicial). */
export const telHref = (phone: string) => {
  const p = phone.trim();
  const digits = p.replace(/[^\d]/g, "");
  return digits ? `tel:${p.startsWith("+") || p.startsWith("00") ? "+" + digits.replace(/^00/, "") : digits}` : "";
};

/** Endereço público do chip. Numa prévia da Vercel (protegida por login), usa o de produção. */
export function publicOrigin(origin: string): string {
  const host = new URL(origin).host;
  return /\.vercel\.app$/.test(host) && host !== "om-shipment.vercel.app" ? "https://om-shipment.vercel.app" : origin;
}

export const nfcText: Record<NfcLanguage, Record<string, string>> = {
  it: {
    loading: "Caricamento…",
    unknownTitle: "Codice non valido",
    unknownHint: "Questo chip non appartiene a un capo Officine Mattio registrato.",
    freeTitle: "Questo capo Officine Mattio non è ancora registrato",
    freeHint: "Se è tuo, registralo: chi avvicina il telefono vedrà i tuoi dati di emergenza, solo quelli che scegli tu.",
    register: "Registra",
    disabledTitle: "Questo capo è stato bloccato dal proprietario",
    disabledHint: "Se l'hai trovato, contatta Officine Mattio.",
    errorTitle: "Non riesco a caricare la pagina",
    retry: "Riprova",
    tooMany: "Troppi tentativi. Riprova tra qualche minuto.",
    emergency: "Scheda di emergenza",
    call: "Chiama",
    callAthlete: "Telefono dell'atleta",
    "field.name": "Nome",
    "field.blood_type": "Gruppo sanguigno",
    "field.emergency_contacts": "Contatti di emergenza",
    "field.allergies": "Allergie",
    "field.conditions": "Patologie",
    "field.medications": "Farmaci",
    "field.phone": "Telefono",
    "field.notes": "Note",
    footer: "Chip NFC Officine Mattio",
    edit: "È tuo? Modifica",
    // cartão do atleta
    registerTitle: "Registra il tuo capo",
    editTitle: "La tua scheda di emergenza",
    intro: "Compila solo quello che vuoi. Accanto a ogni dato scegli se mostrarlo a chi avvicina il telefono al chip.",
    show: "Visibile",
    hidden: "Nascosto",
    email: "E-mail (non viene mai mostrata)",
    contactName: "Nome",
    contactRelation: "Relazione",
    contactPhone: "Telefono",
    addContact: "Aggiungi contatto",
    remove: "Rimuovi",
    none: "—",
    privacyTitle: "Privacy",
    privacyText: "I dati sanitari (gruppo sanguigno, allergie, patologie, farmaci) sono dati particolari secondo il GDPR. Officine Mattio li conserva in Europa solo per mostrarli, in caso di emergenza, a chi avvicina il telefono al chip, e solo i campi che hai reso visibili. Puoi modificarli o cancellarli in ogni momento da questa pagina.",
    privacyAccept: "Ho letto e acconsento al trattamento dei miei dati, compresi quelli sanitari, per questa finalità.",
    save: "Salva",
    saving: "Salvataggio…",
    saved: "Salvato.",
    yourLink: "Il tuo link personale",
    yourLinkHint: "Serve per modificare la scheda: salvalo nei preferiti o inviatelo. Chi ha questo link può modificare i tuoi dati. Se lo perdi, chiedi un link nuovo a Officine Mattio.",
    copy: "Copia link",
    copied: "Copiato",
    share: "Condividi",
    yourTags: "I tuoi capi",
    status_active: "Attivo",
    status_disabled: "Bloccato",
    block: "Blocca (perso o rubato)",
    unblock: "Riattiva",
    deleteAll: "Cancella i miei dati",
    deleteConfirm: "Cancellare tutti i tuoi dati? I capi torneranno liberi e questo link smetterà di funzionare.",
    deleted: "I tuoi dati sono stati cancellati.",
    viewCard: "Vedi la scheda",
    invalidLink: "Link non valido o scaduto",
    invalidHint: "Chiedi un link nuovo a Officine Mattio.",
    alreadyRegistered: "Questo capo è già registrato.",
    errPrivacy: "Per salvare devi accettare l'informativa privacy.",
    errEmail: "E-mail non valida.",
  },
  en: {
    loading: "Loading…",
    unknownTitle: "Invalid code",
    unknownHint: "This chip does not belong to a registered Officine Mattio garment.",
    freeTitle: "This Officine Mattio garment is not registered yet",
    freeHint: "If it's yours, register it: whoever taps a phone on it will see your emergency details, only the ones you choose.",
    register: "Register",
    disabledTitle: "This garment has been blocked by its owner",
    disabledHint: "If you found it, please contact Officine Mattio.",
    errorTitle: "The page could not be loaded",
    retry: "Try again",
    tooMany: "Too many attempts. Please try again in a few minutes.",
    emergency: "Emergency card",
    call: "Call",
    callAthlete: "Athlete's phone",
    "field.name": "Name",
    "field.blood_type": "Blood type",
    "field.emergency_contacts": "Emergency contacts",
    "field.allergies": "Allergies",
    "field.conditions": "Medical conditions",
    "field.medications": "Medications",
    "field.phone": "Phone",
    "field.notes": "Notes",
    footer: "Officine Mattio NFC chip",
    edit: "Is it yours? Edit",
    registerTitle: "Register your garment",
    editTitle: "Your emergency card",
    intro: "Fill in only what you want. Next to each item, choose whether to show it to whoever taps a phone on the chip.",
    show: "Visible",
    hidden: "Hidden",
    email: "E-mail (never shown)",
    contactName: "Name",
    contactRelation: "Relationship",
    contactPhone: "Phone",
    addContact: "Add contact",
    remove: "Remove",
    none: "—",
    privacyTitle: "Privacy",
    privacyText: "Health data (blood type, allergies, conditions, medications) is special-category data under the GDPR. Officine Mattio stores it in Europe only to show it, in an emergency, to whoever taps a phone on the chip, and only the fields you made visible. You can edit or delete it at any time from this page.",
    privacyAccept: "I have read this and consent to the processing of my data, including health data, for this purpose.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    yourLink: "Your personal link",
    yourLinkHint: "You need it to edit your card: bookmark it or send it to yourself. Anyone with this link can edit your data. If you lose it, ask Officine Mattio for a new one.",
    copy: "Copy link",
    copied: "Copied",
    share: "Share",
    yourTags: "Your garments",
    status_active: "Active",
    status_disabled: "Blocked",
    block: "Block (lost or stolen)",
    unblock: "Reactivate",
    deleteAll: "Delete my data",
    deleteConfirm: "Delete all your data? Your garments will be freed and this link will stop working.",
    deleted: "Your data has been deleted.",
    viewCard: "View the card",
    invalidLink: "Invalid or expired link",
    invalidHint: "Ask Officine Mattio for a new link.",
    alreadyRegistered: "This garment is already registered.",
    errPrivacy: "To save, you must accept the privacy notice.",
    errEmail: "Invalid e-mail.",
  },
};

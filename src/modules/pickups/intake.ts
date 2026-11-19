/*
 * Pedido de retirada de parceiros externos (/ritiro/<token>): regras sem tela.
 * Validação do formulário e conversão das caixas para números.
 */

export type PickupReason = "warranty" | "repair" | "return" | "other";
export const PICKUP_REASONS: PickupReason[] = ["warranty", "repair", "return", "other"];

/** Caixa como digitada no formulário (texto); vira número no envio. */
export interface PickupBoxDraft {
  width: string;
  height: string;
  depth: string;
  weight: string;
}

export interface PickupDraft {
  reason: PickupReason | "";
  shop_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  ready_from: string;
  opening_hours: string;
  reference: string;
  description: string;
  boxes: PickupBoxDraft[];
  notes: string;
  website: string; // campo invisível contra robôs
  privacy_accepted: boolean;
}

export const emptyPickup: PickupDraft = {
  reason: "", shop_name: "", contact_name: "", email: "", phone: "", address_line1: "", address_line2: "",
  postal_code: "", city: "", country: "", ready_from: "", opening_hours: "", reference: "", description: "",
  boxes: [], notes: "", website: "", privacy_accepted: false,
};

export const emptyBox: PickupBoxDraft = { width: "", height: "", depth: "", weight: "" };

/** "12,5" ou "12.5" → 12.5; vazio ou inválido → NaN. */
export const toNumber = (s: string) => (String(s).trim() ? Number(String(s).replace(",", ".")) : NaN);

export const boxValid = (b: PickupBoxDraft) => {
  const [w, h, d, kg] = [b.width, b.height, b.depth, b.weight].map(toNumber);
  return [w, h, d].every((n) => n >= 1 && n <= 400) && kg >= 0.1 && kg <= 1000;
};

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Primeira data aceita para o ritiro: hoje. */
export const minReadyDate = (today = new Date()) => isoDate(today);

/** Chave do erro (texto em i18n) ou null quando o pedido pode ser enviado. */
export function validatePickup(d: PickupDraft, today = new Date()): string | null {
  if (!d.reason) return "err.reason";
  const required = [d.shop_name, d.contact_name, d.phone, d.address_line1, d.postal_code, d.city, d.country, d.description];
  if (required.some((v) => !v.trim())) return "err.required";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) return "err.email";
  if (!d.ready_from || d.ready_from < minReadyDate(today)) return "err.date";
  if (d.boxes.some((b) => !boxValid(b))) return "err.box";
  if (!d.privacy_accepted) return "err.privacy";
  return null;
}

/** O que vai para o banco: textos limpos e caixas em número. */
export function pickupPayload(d: PickupDraft, language: string) {
  return {
    ...d,
    email: d.email.trim(),
    boxes: d.boxes.map((b) => ({ width: toNumber(b.width), height: toNumber(b.height), depth: toNumber(b.depth), weight: toNumber(b.weight) })),
    language,
  };
}

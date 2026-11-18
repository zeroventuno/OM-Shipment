/*
 * Regras do pedido público de garantia/assistência, sem dependência de tela:
 * validação do formulário, arquivos aceitos e dados que pré-preenchem o
 * processo interno quando a equipe aceita o pedido.
 */

export type ServiceKind = "warranty" | "assistance";

export interface ServiceDraft {
  kind: ServiceKind | "";
  customer_name: string;
  email: string;
  phone: string;
  country: string;
  shop: string;
  purchase_date: string;
  brand: string;
  product: string;
  size: string;
  serial_number: string;
  problem: string;
  website: string; // campo invisível contra robôs
  privacy_accepted: boolean;
}

export const emptyDraft: ServiceDraft = {
  kind: "", customer_name: "", email: "", phone: "", country: "", shop: "", purchase_date: "",
  brand: "", product: "", size: "", serial_number: "", problem: "", website: "", privacy_accepted: false,
};

export const MAX_PHOTOS = 8;
export const MAX_RECEIPTS = 2;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", pdf: "application/pdf",
};

export const fileExtension = (name: string) => (name.split(".").pop() || "").toLowerCase();

/** Tipo aceito do arquivo; o iPhone às vezes manda HEIC sem tipo, daí vale a extensão. */
export function fileMime(file: { name: string; type: string }, allowPdf: boolean): string | null {
  const mime = file.type || MIME_BY_EXTENSION[fileExtension(file.name)] || "";
  if (mime === "application/pdf") return allowPdf ? mime : null;
  return Object.values(MIME_BY_EXTENSION).includes(mime) ? mime : null;
}

/** Chave do texto de erro, ou null se o pedido pode ser enviado. */
export function validateDraft(d: ServiceDraft): string | null {
  if (!d.kind) return "err.kind";
  if (d.kind === "assistance" && !d.brand.trim()) return "err.brand";
  if (!d.product.trim()) return "err.product";
  if (d.kind === "warranty" && !d.serial_number.trim()) return "err.serial";
  if (!d.problem.trim()) return "err.problem";
  if (!d.customer_name.trim()) return "err.name";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) return "err.email";
  if (!d.privacy_accepted) return "err.privacy";
  return null;
}

export interface ServiceRequestDetails {
  code: string | null;
  phone: string | null;
  country: string | null;
  shop: string | null;
  purchase_date: string | null;
  size?: string | null;
}

/** Dados de contato e compra, para as notas do processo interno. */
export function requestNotes(r: ServiceRequestDetails): string {
  return [
    r.code && `Richiesta: ${r.code}`,
    r.phone && `Telefono: ${r.phone}`,
    r.country && `Paese: ${r.country}`,
    r.shop && `Acquistato presso: ${r.shop}`,
    r.purchase_date && `Data acquisto: ${r.purchase_date.split("-").reverse().join("/")}`,
  ].filter(Boolean).join("\n");
}

interface RequestForProcess extends ServiceRequestDetails {
  customer_name: string;
  email: string;
  brand: string | null;
  product: string;
  serial_number: string | null;
  problem: string;
}

export function ticketPrefill(r: RequestForProcess) {
  const notes = requestNotes(r);
  return {
    clientName: r.customer_name,
    clientEmail: r.email,
    component: r.product,
    brand: r.brand ?? "",
    serialNumber: r.serial_number ?? "",
    problem: notes ? `${r.problem}\n\n${notes}` : r.problem,
  };
}

export function warrantyPrefill(r: RequestForProcess) {
  return {
    customerName: r.customer_name,
    email: r.email,
    bikeModel: r.product,
    serialNumber: r.serial_number ?? "",
    size: r.size ?? "",
    problem: r.problem,
    observation: requestNotes(r),
  };
}

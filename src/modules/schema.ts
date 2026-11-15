import { z } from "zod";

/*
 * Tipos e validação dos formulários de assistências (tickets) e garantias
 * (warranties). A estrutura real das tabelas está em
 * `supabase/migrations/20261115000000_add_assistance_and_warranties.sql`;
 * a leitura e a gravação ficam em `assistance/api.ts` e `warranties/api.ts`.
 *
 * As mensagens de erro são chaves de tradução (ver src/i18n).
 */

export interface HistoryEntry {
  field: string;
  oldValue: any;
  newValue: any;
  date: string;
  action: "created" | "updated";
}

export const TICKET_PHASES = ["Ingresso", "Spedito", "In lavorazione", "Completato"] as const;
export const APPROVAL_STATUSES = ["Approvato", "Rifiutato"] as const;

/** Uma linha da tabela `tickets`, já no formato do app. */
export interface Ticket {
  id: string;
  clientName: string;
  clientEmail: string;
  component: string;
  brand: string;
  serialNumber: string | null;
  problem: string | null;
  protocolNumber: string | null;
  approvalStatus: string | null;
  phase: string;
  shippingDate: Date | null;
  trackingNumber: string | null;
  shippingCompany: string | null;
  completionDate: Date | null;
  /** Custo do último envio ligado (preenchido pelo banco a partir do envio). */
  shippingCost: number | null;
  /** Último envio ligado a esta assistência. */
  shipmentId: string | null;
  history: HistoryEntry[] | null;
  createdAt: Date;
  updatedAt: Date;
}

const required = (msg = "Required field") => z.string().trim().min(1, msg);

const baseTicketSchema = z.object({
  clientName: required(),
  clientEmail: z.string().email("Invalid email"),
  component: required(),
  brand: required(),
  serialNumber: z.string().optional(),
  problem: z.string().optional(),
  protocolNumber: z.string().optional(),
  approvalStatus: z.enum(APPROVAL_STATUSES).optional(),
  phase: z.enum(TICKET_PHASES),
  shippingDate: z.string().optional(),
  trackingNumber: z.string().optional(),
  shippingCompany: z.string().optional(),
  completionDate: z.string().optional(),
});

const approvalRequired = {
  message: "Approval status is required for completed tickets",
  path: ["approvalStatus"],
};

export const insertTicketSchema = baseTicketSchema.refine(
  (data) => !(data.phase === "Completato" && !data.approvalStatus),
  approvalRequired,
);

export const updateTicketSchema = baseTicketSchema.partial().refine(
  (data) => !(data.phase === "Completato" && !data.approvalStatus),
  approvalRequired,
);

export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type UpdateTicket = z.infer<typeof updateTicketSchema>;

export const WARRANTY_STATUSES = ["In attesa", "In lavorazione", "Completato"] as const;
export const PROCESS_TYPES = ["Garantia", "A pagamento"] as const;

/** Uma linha da tabela `warranties`, já no formato do app. */
export interface Warranty {
  id: string;
  startDate: Date;
  customerName: string;
  email: string;
  agent: string;
  serialNumber: string;
  bikeModel: string;
  size: string;
  problem: string;
  observation: string | null;
  paintDetails: string | null;
  componentsDescription: string | null;
  protocolNumber: string | null;
  processType: string;
  status: string;
  solution: string | null;
  producer: string | null;
  newSerialNumber: string | null;
  orderNumber: string | null;
  value: string | null;
  invoice: string | null;
  images: string[] | null;
  /** Dados do último envio ligado (preenchidos pelo banco a partir do envio). */
  shippingDate: Date | null;
  shippingCompany: string | null;
  trackingNumber: string | null;
  shippingCost: number | null;
  shipmentId: string | null;
  history: HistoryEntry[] | null;
  createdAt: Date;
  updatedAt: Date;
}

const optionalText = z.string().nullable().optional();

export const insertWarrantySchema = z.object({
  startDate: z.string().nullable().optional().or(z.date()),
  customerName: required(),
  email: z.string().email("Invalid email"),
  agent: required(),
  serialNumber: required(),
  bikeModel: required(),
  size: required(),
  problem: required(),
  observation: optionalText,
  paintDetails: optionalText,
  componentsDescription: optionalText,
  processType: z.string().optional(),
  status: z.string().optional(),
  solution: optionalText,
  producer: optionalText,
  newSerialNumber: optionalText,
  orderNumber: optionalText,
  value: optionalText,
  invoice: optionalText,
  images: z.array(z.string()).nullable().optional(),
});

export const updateWarrantySchema = insertWarrantySchema.partial();

export type InsertWarranty = z.infer<typeof insertWarrantySchema>;
export type UpdateWarranty = z.infer<typeof updateWarrantySchema>;

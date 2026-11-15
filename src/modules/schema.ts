import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/*
 * Definição das tabelas de assistências (tickets) e garantias (warranties).
 *
 * O Drizzle aqui serve só para descrever as colunas e gerar a validação dos
 * formulários (drizzle-zod); o app não usa o Drizzle para falar com o banco —
 * isso é feito pelo cliente do Supabase em `assistance/api.ts` e
 * `warranties/api.ts`. A estrutura real do banco está em
 * `supabase/migrations/20261115000000_add_assistance_and_warranties.sql`.
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

export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  component: text("component").notNull(),
  brand: text("brand").notNull(),
  serialNumber: text("serial_number"),
  problem: text("problem"),
  protocolNumber: text("protocol_number"),
  approvalStatus: text("approval_status"),
  phase: text("phase").notNull(),
  shippingDate: timestamp("shipping_date", { withTimezone: true }),
  trackingNumber: text("tracking_number"),
  shippingCompany: text("shipping_company"),
  completionDate: timestamp("completion_date", { withTimezone: true }),
  history: jsonb("history").$type<HistoryEntry[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const required = (msg = "Required field") => z.string().trim().min(1, msg);

const baseTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  history: true,
}).extend({
  clientEmail: z.string().email("Invalid email"),
  clientName: required(),
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
export type Ticket = typeof tickets.$inferSelect;

export const WARRANTY_STATUSES = ["In attesa", "In lavorazione", "Completato"] as const;
export const PROCESS_TYPES = ["Garantia", "A pagamento"] as const;

export const warranties = pgTable("warranties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  agent: text("agent").notNull(),
  serialNumber: text("serial_number").notNull(),
  bikeModel: text("bike_model").notNull(),
  size: text("size").notNull(),
  problem: text("problem").notNull(),
  observation: text("observation"),
  paintDetails: text("paint_details"),
  componentsDescription: text("components_description"),
  protocolNumber: text("protocol_number").unique(),
  processType: text("process_type").notNull().default("Garantia"),
  status: text("status").notNull().default("In attesa"),
  solution: text("solution"),
  producer: text("producer"),
  newSerialNumber: text("new_serial_number"),
  orderNumber: text("order_number"),
  value: text("value"),
  invoice: text("invoice"),
  images: jsonb("images").$type<string[]>(),
  history: jsonb("history").$type<HistoryEntry[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWarrantySchema = createInsertSchema(warranties).omit({
  id: true,
  createdAt: true,
  history: true,
  protocolNumber: true,
}).extend({
  email: z.string().email("Invalid email"),
  customerName: required(),
  agent: required(),
  serialNumber: required(),
  bikeModel: required(),
  size: required(),
  problem: required(),
  startDate: z.string().nullable().optional().or(z.date()),
  images: z.array(z.string()).nullable().optional(),
});

export const updateWarrantySchema = insertWarrantySchema.partial();

export type InsertWarranty = z.infer<typeof insertWarrantySchema>;
export type UpdateWarranty = z.infer<typeof updateWarrantySchema>;
export type Warranty = typeof warranties.$inferSelect;

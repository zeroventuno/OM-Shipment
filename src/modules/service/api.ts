import { requireSupabase } from "@/lib/supabase";
import { uploadWarrantyImage } from "@/modules/warranties/api";
import { fileExtension, type ServiceDraft, type ServiceKind } from "./intake";

/*
 * Pedidos de garantia/assistência.
 *
 * O formulário público só fala com as funções service_form_* e envia arquivos
 * para o bucket privado, com a vaga que elas liberam. A fila interna (com
 * login) lê a tabela service_requests.
 */

export const SERVICE_BUCKET = "service-intake";
export const SERVICE_REQUESTS_QUERY_KEY = ["service_requests"];

export interface IntakeFile {
  file: File;
  mime: string;
  folder: "photos" | "receipt";
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const checkServiceLink = (token: string) => rpc<{ ok: boolean }>("service_form_check", { token });

export async function submitServiceRequest(token: string, draft: ServiceDraft, files: IntakeFile[], language: string) {
  let uploadId: string | undefined;
  if (files.length) {
    uploadId = (await rpc<{ upload_id: string }>("service_form_start_upload", { token })).upload_id;
    const storage = requireSupabase().storage.from(SERVICE_BUCKET);
    for (const { file, mime, folder } of files) {
      const path = `${uploadId}/${folder}/${crypto.randomUUID()}.${fileExtension(file.name) || "bin"}`;
      const { error } = await storage.upload(path, file, { contentType: mime, upsert: false });
      if (error) throw error;
    }
  }
  return rpc<{ code: string | null }>("service_form_submit", {
    token,
    request: { ...draft, language, upload_id: uploadId },
  });
}

// --- Fila interna ----------------------------------------------------------

export interface ServiceFile {
  path: string;
  folder: "photos" | "receipt";
  mime: string | null;
  size: number | null;
}

export interface ServiceRequest {
  id: string;
  code: string | null;
  kind: ServiceKind;
  status: "new" | "converted" | "rejected";
  source: string;
  customer_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  shop: string | null;
  purchase_date: string | null;
  brand: string | null;
  product: string;
  size: string | null;
  serial_number: string | null;
  problem: string;
  files: ServiceFile[];
  ticket_id: string | null;
  warranty_id: string | null;
  created_at: string;
}

export async function listServiceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await requireSupabase()
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as ServiceRequest[];
}

export async function setServiceRequestStatus(id: string, status: "new" | "rejected"): Promise<void> {
  const { error } = await requireSupabase().from("service_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function markServiceRequestConverted(id: string, target: { ticket_id: string } | { warranty_id: string }) {
  const { error } = await requireSupabase()
    .from("service_requests")
    .update({ status: "converted", ...target })
    .eq("id", id);
  if (error) throw error;
}

/** Links temporários (1 hora) para a equipe ver os arquivos do bucket privado. */
export async function signedFileUrls(files: ServiceFile[]): Promise<Record<string, string>> {
  if (!files.length) return {};
  const { data, error } = await requireSupabase().storage
    .from(SERVICE_BUCKET)
    .createSignedUrls(files.map((f) => f.path), 3600);
  if (error) throw error;
  return Object.fromEntries((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])));
}

/**
 * Copia as fotos do defeito para as imagens da garantia. O comprovante de
 * compra fica só no bucket privado: o bucket das garantias é público.
 */
export async function copyPhotosToWarranty(files: ServiceFile[]): Promise<string[]> {
  const storage = requireSupabase().storage.from(SERVICE_BUCKET);
  const urls: string[] = [];
  for (const f of files) {
    if (f.folder !== "photos" || !f.mime?.startsWith("image/")) continue;
    const { data, error } = await storage.download(f.path);
    if (error) throw error;
    urls.push(await uploadWarrantyImage(data, fileExtension(f.path)));
  }
  return urls;
}

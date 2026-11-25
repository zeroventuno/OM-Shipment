import { requireSupabase } from "@/lib/supabase";

/*
 * Acessos por login às áreas restritas (por ora Ferie). O painel é só de
 * quem está em app_admins; o banco confere em cada função e nas tabelas.
 */

export type FerieLevel = "none" | "view" | "approve";
export const FERIE_LEVELS: FerieLevel[] = ["none", "view", "approve"];

export interface MyAccess { admin: boolean; ferie: FerieLevel }
export interface UserAccess { user_id: string; email: string; last_sign_in_at: string | null; admin: boolean; ferie: FerieLevel }

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const MY_ACCESS_KEY = ["my_access"];
export const myAccessQuery = { queryKey: MY_ACCESS_KEY, queryFn: () => rpc<MyAccess>("my_access"), staleTime: 60_000 };

export const ACCESS_LIST_KEY = ["access_list"];
export const listAccess = () => rpc<UserAccess[]>("access_admin_list");
/** Convida um login novo (função no servidor; confere se quem chama é administrador). */
export async function createLogin(email: string, ferie: FerieLevel): Promise<{ ok: boolean; user_id: string | null }> {
  const { data } = await requireSupabase().auth.getSession();
  const r = await fetch("/api/create-login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ email, ferie }),
  });
  const body = await r.json().catch(() => ({ error: "unexpected" }));
  if (!r.ok) throw Object.assign(new Error(body.error ?? "unexpected"), { code: body.error });
  return body;
}

export const setAccess = (target: string, level: FerieLevel) => rpc("access_admin_set", { target, area: "ferie", level });

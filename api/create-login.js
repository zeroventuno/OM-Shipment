/* global process */
/*
 * Cria um login novo do Gestionale por convite (Vercel Function).
 *
 * Só o administrador (app_admins) pode chamar: a função confere o token de
 * quem chama no próprio banco (is_app_admin). O convite é feito com a chave
 * de serviço do Supabase, que fica só no servidor (variável
 * SUPABASE_SERVICE_ROLE_KEY na Vercel, nunca no navegador). A pessoa recebe
 * um e-mail, abre o link e cria a própria senha em /reset-password.
 *
 * POST { email, ferie?: "none" | "view" | "approve" }  →  { ok, user_id }
 */

const LEVELS = ["none", "view", "approve"];

export async function createLogin({ body, auth, env, fetchImpl = fetch, origin }) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return { status: 500, json: { error: "not_configured" } };
  if (!service) return { status: 500, json: { error: "missing_service_key" } };

  const token = /^Bearer (.+)$/.exec(auth || "")?.[1];
  if (!token) return { status: 401, json: { error: "login_required" } };

  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return { status: 400, json: { error: "invalid_email" } };
  const ferie = LEVELS.includes(body?.ferie) ? body.ferie : "none";

  // quem chama é administrador?
  const asCaller = { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const adm = await fetchImpl(`${url}/rest/v1/rpc/is_app_admin`, { method: "POST", headers: asCaller, body: "{}" });
  if (!adm.ok || (await adm.json()) !== true) return { status: 403, json: { error: "not_allowed" } };

  // convite (funciona com o cadastro público desligado)
  const redirect = `${origin}/reset-password`;
  const inv = await fetchImpl(`${url}/auth/v1/invite?redirect_to=${encodeURIComponent(redirect)}`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const user = await inv.json().catch(() => ({}));
  if (!inv.ok) {
    const exists = inv.status === 422 || /already|registered|exists/i.test(user?.msg || user?.message || user?.error_description || "");
    return { status: exists ? 409 : 502, json: { error: exists ? "already_exists" : "invite_failed" } };
  }

  // nível de Ferie escolhido junto (com o token de quem chama: o banco confere de novo)
  if (ferie !== "none" && user?.id) {
    await fetchImpl(`${url}/rest/v1/rpc/access_admin_set`, {
      method: "POST", headers: asCaller, body: JSON.stringify({ target: user.id, area: "ferie", level: ferie }),
    });
  }
  return { status: 200, json: { ok: true, user_id: user?.id ?? null } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  try {
    const r = await createLogin({ body, auth: req.headers.authorization, env: process.env, origin: `${proto}://${host}` });
    res.setHeader("Cache-Control", "no-store");
    return res.status(r.status).json(r.json);
  } catch {
    return res.status(500).json({ error: "unexpected" });
  }
}

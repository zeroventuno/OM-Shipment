import { describe, expect, it } from "vitest";
import { createLogin } from "./create-login.js";

const env = { VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    return routes[key](init);
  };
  return { impl, calls };
}

describe("criar login", () => {
  it("convida e já define o nível de Ferie", async () => {
    const f = fakeFetch({ is_app_admin: () => reply(200, true), "/auth/v1/invite": () => reply(200, { id: "u1" }), access_admin_set: () => reply(200, { ok: true }) });
    const r = await createLogin({ body: { email: " Nuova@OM.it ", ferie: "approve" }, auth: "Bearer tok", env, fetchImpl: f.impl, origin: "https://om.app" });
    expect(r).toEqual({ status: 200, json: { ok: true, user_id: "u1" } });
    const invite = f.calls.find((c) => c.url.includes("/invite"));
    expect(invite.url).toContain(encodeURIComponent("https://om.app/reset-password"));
    expect(JSON.parse(invite.init.body)).toEqual({ email: "nuova@om.it" });
    expect(invite.init.headers.Authorization).toBe("Bearer service");
    expect(JSON.parse(f.calls.at(-1).init.body)).toEqual({ target: "u1", area: "ferie", level: "approve" });
  });

  it("recusa quem não é administrador e não convida", async () => {
    const f = fakeFetch({ is_app_admin: () => reply(200, false), "/auth/v1/invite": () => reply(200, { id: "x" }) });
    const r = await createLogin({ body: { email: "a@b.it" }, auth: "Bearer tok", env, fetchImpl: f.impl, origin: "https://om.app" });
    expect(r.status).toBe(403);
    expect(f.calls.some((c) => c.url.includes("/invite"))).toBe(false);
  });

  it("avisa quando falta a chave de serviço, o login ou o e-mail é inválido", async () => {
    const f = fakeFetch({});
    expect((await createLogin({ body: { email: "a@b.it" }, auth: "Bearer t", env: { ...env, SUPABASE_SERVICE_ROLE_KEY: "" }, fetchImpl: f.impl })).json.error).toBe("missing_service_key");
    expect((await createLogin({ body: { email: "a@b.it" }, auth: "", env, fetchImpl: f.impl })).status).toBe(401);
    expect((await createLogin({ body: { email: "nope" }, auth: "Bearer t", env, fetchImpl: f.impl })).json.error).toBe("invalid_email");
  });

  it("e-mail que já tem login", async () => {
    const f = fakeFetch({ is_app_admin: () => reply(200, true), "/auth/v1/invite": () => reply(422, { msg: "A user with this email address has already been registered" }) });
    const r = await createLogin({ body: { email: "a@b.it" }, auth: "Bearer t", env, fetchImpl: f.impl, origin: "https://om.app" });
    expect(r).toEqual({ status: 409, json: { error: "already_exists" } });
  });
});

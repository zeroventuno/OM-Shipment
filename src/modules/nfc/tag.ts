/*
 * Página do chip NFC (/t/<code>): o que abre quando alguém encosta o celular.
 * Script pequeno, sem React nem supabase-js: fala direto com a função
 * nfc_tag_view do banco. Os dados do atleta entram sempre como texto (nunca HTML).
 */
import "./nfc.css";
import { isTagCode, nfcLanguage, nfcText, telHref, type EmergencyContact } from "./text";

type View =
  | { status: "unknown" | "free" | "disabled" }
  | { status: "active"; card: Partial<Record<string, unknown>> };

const lang = nfcLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
const tx = (key: string) => nfcText[lang][key] ?? key;
document.documentElement.lang = lang;

const app = document.getElementById("app")!;
const code = (/^\/t\/([^/?#]+)/.exec(location.pathname)?.[1]) ?? new URLSearchParams(location.search).get("c") ?? "";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, attrs: Record<string, string> = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function show(...nodes: Node[]) {
  app.replaceChildren(...nodes);
}

function message(title: string, hint: string, extra?: Node) {
  const nodes: Node[] = [el("h1", "t-title", title), el("p", "t-text", hint)];
  if (extra) nodes.push(extra);
  show(...nodes);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function renderCard(card: Partial<Record<string, unknown>>) {
  const nodes: Node[] = [el("p", "t-eyebrow", tx("emergency"))];
  const name = str(card.name);
  if (name) nodes.push(el("h1", "t-title", name));

  const blood = str(card.blood_type);
  if (blood) {
    const box = el("div", "t-blood");
    box.append(el("span", "t-eyebrow", tx("field.blood_type")), el("strong", "", blood));
    nodes.push(box);
  }

  const contacts = Array.isArray(card.emergency_contacts) ? (card.emergency_contacts as EmergencyContact[]) : [];
  for (const c of contacts) {
    const href = telHref(str(c.phone));
    if (!href) continue;
    const who = [str(c.name), str(c.relation) && `(${str(c.relation)})`].filter(Boolean).join(" ");
    const a = el("a", "t-btn t-btn-call", `${tx("call")} ${who}`.trim(), { href });
    a.append(el("small", "", str(c.phone)));
    nodes.push(a);
  }

  for (const field of ["allergies", "conditions", "medications", "notes"]) {
    const value = str(card[field]);
    if (!value) continue;
    const sec = el("section", "t-section");
    sec.append(el("h2", "t-eyebrow", tx(`field.${field}`)), el("p", "", value));
    nodes.push(sec);
  }

  const phone = str(card.phone);
  if (phone && telHref(phone)) {
    const sec = el("section", "t-section");
    const p = el("p");
    p.append(el("a", "", phone, { href: telHref(phone) }));
    sec.append(el("h2", "t-eyebrow", tx("callAthlete")), p);
    nodes.push(sec);
  }

  const footer = el("footer", "t-footer t-muted");
  footer.append(el("span", "", tx("footer")), el("a", "", tx("edit"), { href: "/nfc/profilo" }));
  nodes.push(footer);
  show(...nodes);
}

async function load() {
  show(el("p", "t-text", tx("loading")));
  if (!isTagCode(code)) return message(tx("unknownTitle"), tx("unknownHint"));
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/nfc_tag_view`, {
      method: "POST",
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.code === "53400" ? "tooMany" : "error");
    const view = data as View;
    if (view.status === "active") return renderCard(view.card);
    if (view.status === "free") {
      return message(tx("freeTitle"), tx("freeHint"), el("a", "t-btn t-btn-primary", tx("register"), { href: `/t/${code}/registra` }));
    }
    if (view.status === "disabled") return message(tx("disabledTitle"), tx("disabledHint"));
    return message(tx("unknownTitle"), tx("unknownHint"));
  } catch (e) {
    const retry = el("button", "t-btn", tx("retry"), { type: "button" });
    retry.addEventListener("click", load);
    message(tx("errorTitle"), (e as Error).message === "tooMany" ? tx("tooMany") : "", retry);
  }
}

load();

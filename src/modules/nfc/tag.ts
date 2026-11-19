/*
 * Página do chip NFC (/t/<code>): o que abre quando alguém encosta o celular.
 * Script pequeno, sem React nem supabase-js: fala direto com a função
 * nfc_tag_view do banco. Os dados do atleta entram sempre como texto (nunca HTML).
 */
import "./nfc.css";
import { isTagCode, nfcLanguage, nfcText, splitName, telHref, type EmergencyContact } from "./text";

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

function heading(title: Node, role: string) {
  const head = el("div", "t-head");
  head.append(title, el("span", "t-rule"), el("p", "t-role", role));
  return head;
}

function message(title: string, hint: string, extra?: Node) {
  const nodes: Node[] = [heading(el("h1", "t-title", title), "Officine Mattio")];
  if (hint) nodes.push(el("p", "t-text", hint));
  if (extra) nodes.push(extra);
  show(...nodes);
}

// Telefone (traço simples, sem biblioteca de ícones).
const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function renderCard(card: Partial<Record<string, unknown>>) {
  // Nome como no cartão de visitas: "Cristiano Cunha." com o sobrenome e o ponto em cinza.
  const [first, rest] = splitName(str(card.name));
  const title = el("h1", "t-name");
  if (first) {
    title.append(first);
    if (rest) title.append(" ", el("span", "t-dim", rest));
    title.append(el("span", "t-dim", "."));
  } else {
    title.className = "t-title";
    title.textContent = tx("emergency");
  }
  const nodes: Node[] = [heading(title, tx("emergency"))];

  const blood = str(card.blood_type);
  if (blood) {
    const box = el("div", "t-blood");
    box.append(el("span", "t-eyebrow", tx("field.blood_type")), el("strong", "", blood));
    nodes.push(box);
  }

  const contacts = (Array.isArray(card.emergency_contacts) ? (card.emergency_contacts as EmergencyContact[]) : [])
    .filter((c) => telHref(str(c.phone)));
  if (contacts.length) {
    const list = el("section", "t-calls");
    list.append(el("h2", "t-eyebrow", tx("field.emergency_contacts")));
    for (const c of contacts) {
      const a = el("a", "t-call", undefined, { href: telHref(str(c.phone)) });
      const icon = el("span", "t-call-icon");
      icon.innerHTML = PHONE_ICON; // ícone fixo, nunca dado do atleta
      const body = el("span", "t-call-body");
      body.append(
        el("strong", "", `${tx("call")} ${str(c.name) || str(c.phone)}`),
        el("span", "", [str(c.relation), str(c.phone)].filter(Boolean).join(" · ")),
      );
      a.append(icon, body);
      list.append(a);
    }
    nodes.push(list);
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
  const brand = el("span", "t-brand");
  brand.append(el("span", "om-mark om-mark-sm", undefined, { "aria-hidden": "true" }), el("span", "", tx("footer")));
  footer.append(brand, el("a", "", tx("edit"), { href: "/nfc/profilo" }));
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

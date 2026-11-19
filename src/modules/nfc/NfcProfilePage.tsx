import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { requireSupabase } from "@/lib/supabase";
import "./nfc.css";
import {
  BLOOD_TYPES, DEFAULT_VISIBILITY, NFC_LANGUAGES, PROFILE_FIELDS, isTagCode, nfcLanguage, nfcText,
  type EmergencyContact, type NfcLanguage, type ProfileField,
} from "./text";
import { blockTag, claimTag, deleteMe, getMe, rememberToken, rememberedToken, saveMe, type NfcMe, type NfcProfile } from "./api";

/*
 * Cartão do atleta, sem login:
 *   /t/<code>/registra  registra a peça (cria o cartão e o link pessoal);
 *   /nfc/profilo#<token> edita o cartão, bloqueia peças e apaga os dados.
 */

const emptyProfile: NfcProfile = {
  name: "", email: "", phone: "", blood_type: "", allergies: "", conditions: "", medications: "",
  emergency_contacts: [{ name: "", relation: "", phone: "" }], notes: "", visibility: { ...DEFAULT_VISIBILITY },
};

function fromMe(me: NfcMe): NfcProfile {
  const contacts = me.emergency_contacts?.length ? me.emergency_contacts : emptyProfile.emergency_contacts;
  return {
    name: me.name ?? "", email: me.email ?? "", phone: me.phone ?? "", blood_type: me.blood_type ?? "",
    allergies: me.allergies ?? "", conditions: me.conditions ?? "", medications: me.medications ?? "",
    emergency_contacts: contacts, notes: me.notes ?? "",
    visibility: { ...DEFAULT_VISIBILITY, ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, Boolean(me.visibility?.[f])])) },
  };
}

type Phase = "loading" | "form" | "invalid" | "taken" | "unknown" | "deleted";

export default function NfcProfilePage() {
  const { code } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const claiming = code !== undefined;

  const [lang, setLang] = useState<NfcLanguage>(() => nfcLanguage(navigator.languages ?? [navigator.language]));
  const tx = (key: string) => nfcText[lang][key] ?? key;

  const [token] = useState(() => (claiming ? null : hash.slice(1) || rememberedToken()));
  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<NfcMe | null>(null);
  const [form, setForm] = useState<NfcProfile>(emptyProfile);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.body.classList.add("nfc-page");
    const title = document.title;
    document.title = "Officine Mattio";
    return () => { document.body.classList.remove("nfc-page"); document.title = title; };
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    let alive = true;
    if (claiming) {
      if (!isTagCode(code)) { setPhase("unknown"); return; }
      requireSupabase().rpc("nfc_tag_view", { code }).then(({ data, error: e }) => {
        if (!alive) return;
        if (e) { setError(e.message); setPhase("form"); return; }
        setPhase(data?.status === "free" ? "form" : data?.status === "unknown" ? "unknown" : "taken");
      });
    } else if (!token) {
      setPhase("invalid");
    } else {
      getMe(token).then((m) => {
        if (!alive) return;
        setMe(m); setForm(fromMe(m)); setPrivacy(true); rememberToken(token);
        if (m.language && (NFC_LANGUAGES as readonly string[]).includes(m.language)) setLang(m.language as NfcLanguage);
        // o link fica na barra de endereço, para salvar nos favoritos
        if (!window.location.hash) window.history.replaceState(null, "", `/nfc/profilo#${token}`);
        setPhase("form");
      }).catch(() => { if (alive) { rememberToken(null); setPhase("invalid"); } });
    }
    return () => { alive = false; };
  }, [claiming, code, token]);

  const errorText = (e: unknown) => {
    const m = (e as Error)?.message ?? "";
    if (/privacy/.test(m)) return tx("errPrivacy");
    if (/invalid email/.test(m)) return tx("errEmail");
    if (/already registered/.test(m)) return tx("alreadyRegistered");
    if (/too many/.test(m)) return tx("tooMany");
    return m || tx("errorTitle");
  };

  const set = <K extends keyof NfcProfile>(key: K, value: NfcProfile[K]) => { setForm((f) => ({ ...f, [key]: value })); setNotice(""); };
  const setVisible = (field: ProfileField, value: boolean) => {
    setForm((f) => ({ ...f, visibility: { ...f.visibility, [field]: value } }));
    setNotice("");
  };
  const setContact = (i: number, key: keyof EmergencyContact, value: string) =>
    set("emergency_contacts", form.emergency_contacts.map((c, j) => (j === i ? { ...c, [key]: value } : c)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice("");
    if (!privacy) { setError(tx("errPrivacy")); return; }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setError(tx("errEmail")); return; }
    setBusy(true);
    try {
      const profile = { ...form, language: lang };
      if (claiming) {
        const { token: newToken } = await claimTag(code!, { ...profile, privacy_accepted: true });
        rememberToken(newToken);
        navigate(`/nfc/profilo#${newToken}`, { replace: true });
      } else {
        const m = await saveMe(token!, profile);
        setMe(m); setForm(fromMe(m)); setNotice(tx("saved"));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock(tagCode: string, blocked: boolean) {
    setError("");
    try { setMe(await blockTag(token!, tagCode, blocked)); } catch (err) { setError(errorText(err)); }
  }

  async function removeAll() {
    if (!window.confirm(tx("deleteConfirm"))) return;
    try {
      await deleteMe(token!);
      rememberToken(null);
      window.history.replaceState(null, "", "/nfc/profilo");
      setPhase("deleted");
    } catch (err) { setError(errorText(err)); }
  }

  const personalLink = token ? `${window.location.origin}/nfc/profilo#${token}` : "";
  async function copyLink() {
    try { await navigator.clipboard.writeText(personalLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão */ }
  }

  const shell = (children: ReactNode) => (
    <>
      <div className="nfc-bg" aria-hidden="true"><span className="om-mark" /></div>
      <div className="om-top nfc-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <img src="/logo.png" alt="Officine Mattio" className="om-logo" />
          <span className="om-flag" aria-hidden="true" />
        </div>
        <div className="nfc-lang" role="group" aria-label="Lingua / Language">
          {NFC_LANGUAGES.map((l) => (
            <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <main className="nfc-wrap">{children}</main>
    </>
  );

  // Título como no cartão de visitas: ponto final em cinza, filete dourado e rótulo espaçado.
  const head = (title: string, extra?: ReactNode) => (
    <div className="t-head">
      <h1 className="t-title">{title}<span className="t-dim">.</span></h1>
      <span className="t-rule" aria-hidden="true" />
      <p className="t-role">{tx("footer")}</p>
      {extra}
    </div>
  );

  if (phase === "loading") return shell(<p className="t-text">{tx("loading")}</p>);
  if (phase === "invalid") return shell(<>{head(tx("invalidLink"))}<p className="t-text">{tx("invalidHint")}</p></>);
  if (phase === "unknown") return shell(<>{head(tx("unknownTitle"))}<p className="t-text">{tx("unknownHint")}</p></>);
  if (phase === "taken") return shell(<>{head(tx("alreadyRegistered"))}<a className="t-btn" href={`/t/${code}`}>{tx("viewCard")}</a></>);
  if (phase === "deleted") return shell(head(tx("deleted")));

  const toggle = (field: ProfileField) => (
    <button type="button" className="f-toggle" aria-pressed={form.visibility[field]} onClick={() => setVisible(field, !form.visibility[field])}>
      {form.visibility[field] ? tx("show") : tx("hidden")}
    </button>
  );
  const text = (field: "name" | "phone", type = "text", autoComplete = "") => (
    <div className="f-field">
      <label className="f-label" htmlFor={`f-${field}`}>{tx(`field.${field}`)}{toggle(field)}</label>
      <input id={`f-${field}`} className="f-input" type={type} autoComplete={autoComplete} value={form[field]} onChange={(e) => set(field, e.target.value)} />
    </div>
  );
  const area = (field: "allergies" | "conditions" | "medications" | "notes") => (
    <div className="f-field">
      <label className="f-label" htmlFor={`f-${field}`}>{tx(`field.${field}`)}{toggle(field)}</label>
      <textarea id={`f-${field}`} className="f-input" maxLength={1000} value={form[field]} onChange={(e) => set(field, e.target.value)} />
    </div>
  );

  return shell(
    <>
      {head(claiming ? tx("registerTitle") : tx("editTitle"))}
      <p className="t-text">{tx("intro")}</p>

      {!claiming && (
        <section className="f-box f-box-strong">
          <h2 className="t-eyebrow">{tx("yourLink")}</h2>
          <p className="t-text" style={{ fontSize: 15 }}>{tx("yourLinkHint")}</p>
          <p className="f-code">{personalLink}</p>
          <div className="f-row">
            <button type="button" className="t-btn t-btn-primary" onClick={copyLink}>{copied ? tx("copied") : tx("copy")}</button>
            {typeof navigator.share === "function" && (
              <button type="button" className="t-btn" onClick={() => navigator.share({ title: "Officine Mattio", url: personalLink }).catch(() => {})}>{tx("share")}</button>
            )}
          </div>
        </section>
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
        {text("name", "text", "name")}

        <div className="f-field">
          <label className="f-label" htmlFor="f-blood">{tx("field.blood_type")}{toggle("blood_type")}</label>
          <select id="f-blood" className="f-input" value={form.blood_type} onChange={(e) => set("blood_type", e.target.value)}>
            <option value="">{tx("none")}</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="f-field">
          <span className="f-label">{tx("field.emergency_contacts")}{toggle("emergency_contacts")}</span>
          {form.emergency_contacts.map((c, i) => (
            <div key={i} className="f-contact">
              <input className="f-input" aria-label={tx("contactName")} placeholder={tx("contactName")} value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} />
              <input className="f-input" aria-label={tx("contactRelation")} placeholder={tx("contactRelation")} value={c.relation} onChange={(e) => setContact(i, "relation", e.target.value)} />
              <input className="f-input" aria-label={tx("contactPhone")} placeholder={tx("contactPhone")} type="tel" value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} />
              {form.emergency_contacts.length > 1 && (
                <button type="button" className="f-link" onClick={() => set("emergency_contacts", form.emergency_contacts.filter((_, j) => j !== i))}>{tx("remove")}</button>
              )}
            </div>
          ))}
          {form.emergency_contacts.length < 3 && (
            <button type="button" className="f-link" onClick={() => set("emergency_contacts", [...form.emergency_contacts, { name: "", relation: "", phone: "" }])}>+ {tx("addContact")}</button>
          )}
        </div>

        {area("allergies")}
        {area("conditions")}
        {area("medications")}
        {text("phone", "tel", "tel")}
        {area("notes")}

        <div className="f-field">
          <label className="f-label" htmlFor="f-email">{tx("email")}</label>
          <input id="f-email" className="f-input" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>

        <section className="f-box">
          <h2 className="t-eyebrow">{tx("privacyTitle")}</h2>
          <p className="t-text" style={{ fontSize: 15 }}>{tx("privacyText")}</p>
          {claiming && (
            <label className="f-check">
              <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span>{tx("privacyAccept")}</span>
            </label>
          )}
        </section>

        {error && <p className="f-error" role="alert">{error}</p>}
        {notice && <p className="f-ok" role="status">{notice}</p>}
        <button type="submit" className="t-btn t-btn-primary" disabled={busy}>{busy ? tx("saving") : tx("save")}</button>
      </form>

      {!claiming && me && (
        <>
          <section className="f-box">
            <h2 className="t-eyebrow">{tx("yourTags")}</h2>
            {me.tags.map((t) => (
              <div key={t.code} className="f-tag">
                <span><span className="f-code">{t.code}</span> · {tx(`status_${t.status}`)}</span>
                <span className="f-row" style={{ flex: "0 0 auto" }}>
                  <Link className="f-link" to={`/t/${t.code}`} reloadDocument>{tx("viewCard")}</Link>
                  <button type="button" className="f-link" onClick={() => toggleBlock(t.code, t.status !== "disabled")}>
                    {t.status === "disabled" ? tx("unblock") : tx("block")}
                  </button>
                </span>
              </div>
            ))}
          </section>
          <button type="button" className="t-btn t-btn-danger" onClick={removeAll}>{tx("deleteAll")}</button>
        </>
      )}
    </>,
  );
}

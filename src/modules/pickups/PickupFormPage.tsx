import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "@/modules/customers/fields";
import { COUNTRIES, countryLabel } from "@/modules/shipments/data/countries";
import { LANGUAGE_NAMES, PUBLIC_LANGUAGES, detectLanguage, type PublicLanguage } from "@/modules/service/i18n";
import { checkPickupLink, pickupBoxPresets, submitPickupRequest } from "./api";
import { pickupText } from "./i18n";
import {
  PICKUP_REASONS, emptyBox, emptyPickup, minReadyDate, validatePickup,
  type PickupBoxDraft, type PickupDraft,
} from "./intake";

/*
 * Pedido de retirada para lojas e parceiros externos, aberto por /ritiro/<token>.
 * Só envia: não mostra clientes, endereços nem outros pedidos da Officine Mattio.
 */

const initialLanguage = () => detectLanguage(
  new URLSearchParams(window.location.search).get("lang"),
  navigator.languages?.length ? navigator.languages : [navigator.language],
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
    <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{title}</h2>
    {children}
  </section>
);

/** Dentro do link pessoal (/ferie/<token>): sem cabeçalho próprio, e quem pede já é conhecido. */
export interface EmbedProps { token?: string; embedded?: boolean; agent?: string }

export default function PickupFormPage({ token: tokenProp, embedded = false, agent }: EmbedProps = {}) {
  const { token: routeToken = "" } = useParams();
  const token = tokenProp ?? routeToken;
  // No link pessoal, sempre em italiano (a equipe é italiana), não no idioma do navegador.
  const [lang, setLang] = useState<PublicLanguage>(() => (embedded ? "it" : initialLanguage()));
  const [draft, setDraft] = useState<PickupDraft>(emptyPickup);
  const [error, setError] = useState("");
  const [doneCode, setDoneCode] = useState<string | null | undefined>(undefined);

  const tx = (key: string, values: Record<string, string> = {}) =>
    Object.entries(values).reduce((text, [k, v]) => text.replace(`{{${k}}}`, v), pickupText[lang][key] ?? key);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const link = useQuery({ queryKey: ["pickup-form", token], queryFn: () => checkPickupLink(token), retry: false });
  const presets = useQuery({ queryKey: ["pickup-presets", token], queryFn: () => pickupBoxPresets(token), enabled: link.isSuccess });

  // Países no idioma escolhido; o valor gravado é o mesmo da tela de envios.
  const countries = useMemo(() => COUNTRIES
    .map((c: { code: string; value: string }) => ({ ...c, label: countryLabel(c.code, lang) }))
    .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, lang)), [lang]);

  const set = <K extends keyof PickupDraft>(field: K, value: PickupDraft[K]) => setDraft((d) => ({ ...d, [field]: value }));
  const setBox = (i: number, patch: Partial<PickupBoxDraft>) =>
    set("boxes", draft.boxes.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const submit = useMutation({
    mutationFn: () => submitPickupRequest(token, draft, lang),
    onSuccess: (r) => { setDoneCode(r.code); setDraft(emptyPickup); if (!embedded) window.scrollTo({ top: 0 }); },
    onError: (e: { code?: string }) => setError(tx(e.code === "53400" ? "err.busy" : "err.send")),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePickup(draft);
    setError(problem ? tx(problem) : "");
    if (!problem) submit.mutate();
  };

  if (link.isLoading) {
    return <div className={`${embedded ? "py-16" : "min-h-screen bg-background"} flex items-center justify-center`}><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (link.isError) {
    return (
      <div className={`${embedded ? "py-16" : "min-h-screen bg-background"} flex flex-col items-center justify-center gap-4 px-6 text-center`}>
        <img src="/logo.png" alt="Officine Mattio" className="h-7" />
        <p className="text-lg font-semibold">{tx("invalidLink")}</p>
        <p className="text-sm text-muted-foreground">{tx("invalidHint")}</p>
      </div>
    );
  }

  const optional = (label: string) => `${label} (${tx("optional")})`;

  return (
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      {!embedded && (
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2 shrink-0">
            <img src="/logo.png" alt="Officine Mattio" className="h-6 w-auto invert self-start" />
            <span className="tricolor h-0.5 w-12" aria-hidden="true" />
          </div>
          <div className="relative shrink-0">
            {/* Lista nativa: no celular abre o seletor do próprio aparelho. Com 16px o iPhone não dá zoom. */}
            <select value={lang} aria-label={tx("language")}
              onChange={(e) => { setLang(e.target.value as PublicLanguage); setError(""); }}
              className="h-11 appearance-none rounded-full border border-white/30 bg-transparent pl-4 pr-9 text-base font-medium text-white">
              {PUBLIC_LANGUAGES.map((l) => <option key={l} value={l} className="text-black">{LANGUAGE_NAMES[l]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
          </div>
        </div>
      </header>
      )}

      <main className={embedded ? "flex flex-col gap-6" : "max-w-3xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6"}>
        <div className="flex flex-col gap-2">
          <h1 className="page-title">{tx("title")}</h1>
          {doneCode === undefined && <p className="text-muted-foreground">{tx("intro")}</p>}
        </div>

        {doneCode !== undefined ? (
          <div role="status" className="flex flex-col items-start gap-3 p-6 bg-card border border-border rounded-lg">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-lg font-semibold">{tx("doneTitle")}</p>
            {doneCode && <p className="font-semibold">{tx("doneCode", { code: doneCode })}</p>}
            <p className="text-sm text-muted-foreground">{tx("doneText")}</p>
            <Button type="button" variant="outline" onClick={() => setDoneCode(undefined)}>{tx("another")}</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <Section title={tx("reasonLabel")}>
              <div role="radiogroup" aria-label={tx("reasonLabel")} className="grid gap-3 sm:grid-cols-2">
                {PICKUP_REASONS.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={draft.reason === value} onClick={() => set("reason", value)}
                    className={cn("text-left rounded-md border p-4 flex flex-col gap-1",
                      draft.reason === value ? "border-foreground bg-secondary ring-1 ring-foreground" : "border-border hover:border-foreground")}>
                    <span className="font-semibold">{tx(`reason.${value}`)}</span>
                    <span className="text-sm text-muted-foreground">{tx(`reason.${value}Hint`)}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={tx("shop")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tx("shopName")}><Input value={draft.shop_name} autoComplete="organization" onChange={(e) => set("shop_name", e.target.value)} /></Field>
                <Field label={tx("contactName")}><Input value={draft.contact_name} autoComplete="name" onChange={(e) => set("contact_name", e.target.value)} /></Field>
                <Field label={tx("email")}><Input type="email" value={draft.email} autoComplete="email" onChange={(e) => set("email", e.target.value)} /></Field>
                <Field label={tx("phone")}><Input type="tel" value={draft.phone} autoComplete="tel" onChange={(e) => set("phone", e.target.value)} /></Field>
              </div>
            </Section>

            <Section title={tx("address")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tx("line1")}><Input value={draft.address_line1} autoComplete="address-line1" onChange={(e) => set("address_line1", e.target.value)} /></Field>
                <Field label={optional(tx("line2"))}><Input value={draft.address_line2} autoComplete="address-line2" onChange={(e) => set("address_line2", e.target.value)} /></Field>
                <Field label={tx("postalCode")}><Input value={draft.postal_code} autoComplete="postal-code" onChange={(e) => set("postal_code", e.target.value)} /></Field>
                <Field label={tx("city")}><Input value={draft.city} autoComplete="address-level2" onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label={tx("country")}>
                  <div className="relative">
                    <select value={draft.country} onChange={(e) => set("country", e.target.value)}
                      className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-base">
                      <option value="">{tx("countryPh")}</option>
                      {countries.map((c: { code: string; value: string; label: string }) => <option key={c.code} value={c.value}>{c.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
                  </div>
                </Field>
              </div>
            </Section>

            {/* Destino fixo: a retirada sempre vem para a Officine Mattio. */}
            <Section title={tx("destination")}>
              <div className="flex flex-col gap-0.5 rounded-md bg-secondary p-4 text-sm">
                <p className="font-semibold">Officine Mattio Srl</p>
                <p>Via Renzo Gandolfo 6/A, Fraz. Madonna dell’Olmo</p>
                <p>12100 Cuneo (CN) · {tx("italy")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{tx("destinationHint")}</p>
            </Section>

            <Section title={tx("when")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tx("readyFrom")}><Input type="date" min={minReadyDate()} value={draft.ready_from} onChange={(e) => set("ready_from", e.target.value)} /></Field>
                <Field label={optional(tx("openingHours"))}><Input value={draft.opening_hours} placeholder={tx("openingPh")} onChange={(e) => set("opening_hours", e.target.value)} /></Field>
              </div>
            </Section>

            <Section title={tx("what")}>
              <Field label={tx("description")}>
                <Textarea rows={3} value={draft.description} maxLength={2000} placeholder={tx("descriptionPh")} onChange={(e) => set("description", e.target.value)} />
              </Field>
              <Field label={optional(tx("reference"))} hint={tx("referenceHint")}>
                <Input value={draft.reference} onChange={(e) => set("reference", e.target.value)} />
              </Field>

              <div className="flex flex-col gap-3 pt-2">
                <span className="eyebrow">{optional(tx("boxes"))}</span>
                <span className="text-sm text-muted-foreground -mt-2">{tx("boxesHint")}</span>
                {draft.boxes.map((b, i) => (
                  <div key={i} className="rounded-md border border-border p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{tx("box")} {i + 1}</span>
                      <button type="button" aria-label={`${tx("remove")} ${tx("box")} ${i + 1}`}
                        onClick={() => set("boxes", draft.boxes.filter((_, j) => j !== i))}
                        className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-secondary">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {!!presets.data?.length && (
                      <Field label={tx("preset")}>
                        <div className="relative">
                          <select defaultValue="" aria-label={tx("preset")}
                            onChange={(e) => {
                              const p = presets.data?.find((x) => x.id === e.target.value);
                              if (p) setBox(i, { width: String(p.width), height: String(p.height), depth: String(p.depth), weight: p.avg_weight ? String(p.avg_weight) : b.weight });
                            }}
                            className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-base">
                            <option value="">{tx("presetPh")}</option>
                            {presets.data.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.width}×{p.height}×{p.depth} cm</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
                        </div>
                      </Field>
                    )}
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                      {(["width", "height", "depth", "weight"] as const).map((k) => (
                        <Field key={k} label={tx(k)}>
                          <Input inputMode="decimal" value={b[k]} onChange={(e) => setBox(i, { [k]: e.target.value })} />
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
                {draft.boxes.length < 20 && (
                  <Button type="button" variant="outline" className="self-start" onClick={() => set("boxes", [...draft.boxes, { ...emptyBox }])}>
                    <Plus /> {tx("addBox")}
                  </Button>
                )}
              </div>

              <Field label={optional(tx("notes"))}>
                <Textarea rows={3} value={draft.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} />
              </Field>
              {/* Invisível para pessoas: só robôs preenchem. */}
              <input type="text" name="website" value={draft.website} onChange={(e) => set("website", e.target.value)}
                tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
              <label className="flex items-start gap-3 text-sm min-h-11">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={draft.privacy_accepted} onChange={(e) => set("privacy_accepted", e.target.checked)} />
                <span>{tx("privacy")}</span>
              </label>
            </Section>

            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={submit.isPending} className="self-stretch sm:self-start">
              {submit.isPending && <Loader2 className="animate-spin" />}
              {tx(submit.isPending ? "sending" : "send")}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}

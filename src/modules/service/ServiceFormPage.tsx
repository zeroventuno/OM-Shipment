import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "@/modules/customers/fields";
import { checkServiceLink, submitServiceRequest, type IntakeFile } from "./api";
import { PUBLIC_LANGUAGES, publicText, type PublicLanguage } from "./i18n";
import {
  MAX_FILE_BYTES, MAX_PHOTOS, MAX_RECEIPTS, emptyDraft, fileMime, validateDraft,
  type ServiceDraft, type ServiceKind,
} from "./intake";

/*
 * Formulário público de garantia/assistência, aberto por /assistenza/<token>.
 * Serve a clientes finais: só envia. Não mostra clientes nem outros pedidos.
 */

function initialLanguage(): PublicLanguage {
  const requested = new URLSearchParams(window.location.search).get("lang") || navigator.language || "";
  const code = requested.slice(0, 2).toLowerCase();
  return (PUBLIC_LANGUAGES as readonly string[]).includes(code) ? (code as PublicLanguage) : "it";
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
    <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{title}</h2>
    {children}
  </section>
);

export default function ServiceFormPage() {
  const { token = "" } = useParams();
  const [lang, setLang] = useState<PublicLanguage>(initialLanguage);
  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [error, setError] = useState("");
  const [doneCode, setDoneCode] = useState<string | null | undefined>(undefined);
  const photoInput = useRef<HTMLInputElement>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  const tx = (key: string, values: Record<string, string> = {}) =>
    Object.entries(values).reduce((text, [k, v]) => text.replace(`{{${k}}}`, v), publicText[lang][key] ?? key);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const link = useQuery({ queryKey: ["service-form", token], queryFn: () => checkServiceLink(token), retry: false });

  const set = <K extends keyof ServiceDraft>(field: K, value: ServiceDraft[K]) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const addFiles = (list: FileList | null, folder: IntakeFile["folder"]) => {
    setError("");
    const limit = folder === "photos" ? MAX_PHOTOS : MAX_RECEIPTS;
    const next = [...files];
    for (const file of Array.from(list ?? [])) {
      const mime = fileMime(file, folder === "receipt");
      if (!mime) { setError(tx("err.fileType", { name: file.name })); continue; }
      if (file.size > MAX_FILE_BYTES) { setError(tx("err.fileSize", { name: file.name })); continue; }
      if (next.filter((f) => f.folder === folder).length >= limit) { setError(tx("err.fileCount")); break; }
      next.push({ file, mime, folder });
    }
    setFiles(next);
  };

  const submit = useMutation({
    mutationFn: () => submitServiceRequest(token, draft, files, lang),
    onSuccess: (r) => {
      setDoneCode(r.code);
      setDraft(emptyDraft);
      setFiles([]);
      window.scrollTo({ top: 0 });
    },
    onError: (e: { code?: string }) => setError(tx(e.code === "53400" ? "err.busy" : "err.send")),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateDraft(draft);
    setError(problem ? tx(problem) : "");
    if (!problem) submit.mutate();
  };

  const fileList = (folder: IntakeFile["folder"], label: string, hint: string, accept: string, input: typeof photoInput) => (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">{label}</span>
      <input ref={input} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} aria-label={label}
        onChange={(e) => { addFiles(e.target.files, folder); e.target.value = ""; }} />
      {files.filter((f) => f.folder === folder).map((f) => (
        <div key={`${f.file.name}-${f.file.size}-${f.file.lastModified}`} className="flex items-center gap-2 rounded-md bg-secondary pl-3 text-sm">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 min-w-0 truncate">{f.file.name}</span>
          <button type="button" aria-label={`${tx("removeFile")} ${f.file.name}`} onClick={() => setFiles((all) => all.filter((x) => x !== f))}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center hover:bg-card">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" className="self-start" onClick={() => input.current?.click()}>{tx("addFiles")}</Button>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );

  if (link.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (link.isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src="/logo.png" alt="Officine Mattio" className="h-7" />
        <p className="text-lg font-semibold">{tx("invalidLink")}</p>
        <p className="text-sm text-muted-foreground">{tx("invalidHint")}</p>
      </div>
    );
  }

  const kinds: [ServiceKind, string, string][] = [
    ["warranty", tx("warrantyTitle"), tx("warrantyHint")],
    ["assistance", tx("assistanceTitle"), tx("assistanceHint")],
  ];
  const optional = (label: string) => `${label} (${tx("optional")})`;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex flex-col gap-2 shrink-0">
            <img src="/logo.png" alt="Officine Mattio" className="h-6 w-auto invert self-start" />
            <span className="tricolor h-0.5 w-12" aria-hidden="true" />
          </div>
          <div className="flex gap-1" role="group" aria-label={tx("language")}>
            {PUBLIC_LANGUAGES.map((l) => (
              <button key={l} type="button" onClick={() => { setLang(l); setError(""); }} aria-pressed={lang === l}
                className={cn("h-9 w-10 rounded-full border text-[11px] font-semibold uppercase tracking-[0.08em]",
                  lang === l ? "bg-white text-primary border-white" : "border-white/30 text-white/70")}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
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
            <Section title={tx("kindLabel")}>
              <div role="radiogroup" aria-label={tx("kindLabel")} className="grid gap-3 sm:grid-cols-2">
                {kinds.map(([value, title, hint]) => (
                  <button key={value} type="button" role="radio" aria-checked={draft.kind === value} onClick={() => set("kind", value)}
                    className={cn("text-left rounded-md border p-4 flex flex-col gap-1",
                      draft.kind === value ? "border-foreground bg-secondary ring-1 ring-foreground" : "border-border hover:border-foreground")}>
                    <span className="font-semibold">{title}</span>
                    <span className="text-sm text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            </Section>

            {draft.kind && (
              <>
                <Section title={tx("product")}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {draft.kind === "assistance" && (
                      <Field label={tx("brand")}><Input value={draft.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Shimano, SRAM…" /></Field>
                    )}
                    <Field label={tx(draft.kind === "warranty" ? "bikeModel" : "component")}>
                      <Input value={draft.product} onChange={(e) => set("product", e.target.value)} placeholder={draft.kind === "assistance" ? tx("componentPh") : undefined} />
                    </Field>
                    {draft.kind === "warranty" && (
                      <Field label={optional(tx("size"))}><Input value={draft.size} onChange={(e) => set("size", e.target.value)} /></Field>
                    )}
                    <Field label={draft.kind === "warranty" ? tx("serial") : optional(tx("serial"))} hint={tx("serialHint")}>
                      <Input value={draft.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
                    </Field>
                    <Field label={optional(tx("shop"))}><Input value={draft.shop} onChange={(e) => set("shop", e.target.value)} /></Field>
                    <Field label={optional(tx("purchaseDate"))}>
                      <Input type="date" value={draft.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
                    </Field>
                  </div>
                  <Field label={tx("problem")}>
                    <Textarea rows={5} value={draft.problem} maxLength={5000} placeholder={tx("problemPh")} onChange={(e) => set("problem", e.target.value)} />
                  </Field>
                </Section>

                <Section title={tx("files")}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {fileList("photos", optional(tx("photos")), tx("photosHint"), "image/*", photoInput)}
                    {fileList("receipt", optional(tx("receipt")), tx("receiptHint"), "image/*,application/pdf", receiptInput)}
                  </div>
                </Section>

                <Section title={tx("contact")}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tx("name")}><Input value={draft.customer_name} autoComplete="name" onChange={(e) => set("customer_name", e.target.value)} /></Field>
                    <Field label={tx("email")}><Input type="email" value={draft.email} autoComplete="email" onChange={(e) => set("email", e.target.value)} /></Field>
                    <Field label={optional(tx("phone"))}><Input type="tel" value={draft.phone} autoComplete="tel" onChange={(e) => set("phone", e.target.value)} /></Field>
                    <Field label={optional(tx("country"))}><Input value={draft.country} autoComplete="country-name" onChange={(e) => set("country", e.target.value)} /></Field>
                  </div>
                  {/* Invisível para pessoas: só robôs preenchem. */}
                  <input type="text" name="website" value={draft.website} onChange={(e) => set("website", e.target.value)}
                    tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
                  <label className="flex items-start gap-3 text-sm min-h-11">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={draft.privacy_accepted} onChange={(e) => set("privacy_accepted", e.target.checked)} />
                    <span>{tx("privacy")}</span>
                  </label>
                </Section>
              </>
            )}

            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
            {draft.kind && (
              <Button type="submit" size="lg" disabled={submit.isPending} className="self-stretch sm:self-start">
                {submit.isPending && <Loader2 className="animate-spin" />}
                {tx(submit.isPending ? "sending" : "send")}
              </Button>
            )}
          </form>
        )}
      </main>
    </div>
  );
}

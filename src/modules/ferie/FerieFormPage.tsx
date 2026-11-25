import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/modules/customers/fields";
import { LeaveMap } from "./LeaveMap";
import { InstallHint } from "@/components/InstallHint";
import { AgendaForm, MyAgenda, type AgendaMode } from "./FormAgenda";
import { cn } from "@/lib/utils";
import { MonthNav, PartPicker, Section, SectorsProvider, StatusChip, useDuration, useMonthWindow } from "./parts";
import { ferieFormAnswer, ferieFormCancel, ferieFormData, ferieFormSubmit, type FormRequest } from "./api";
import { absences, blockingEvent, conflictsFor, displayName, parseHours, sectorNamer, todayRome, validateLeave, type DayPart } from "./logic";
import { LIVE } from "@/lib/live";

/*
 * Link pessoal do funcionário (/ferie/<token>): pedir férias, ver a resposta
 * e o mapa da equipe. Sem login; só fala com as funções ferie_form_*.
 */

const empty = () => ({ start_date: "", end_date: "", part: "full" as DayPart, hours: "", note: "" });

export default function FerieFormPage() {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ["ferie-form", token];
  const data = useQuery({
    queryKey: key, retry: false, ...LIVE,
    // nomes já na ordem escolhida pelo escritório
    queryFn: async () => {
      const r = await ferieFormData(token);
      const o = r.name_order ?? "first_last";
      return { ...r, me: { ...r.me, name: displayName(r.me, o) }, employees: r.employees.map((e) => ({ ...e, name: displayName(e, o) })) };
    },
  });
  const [draft, setDraft] = useState(empty);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"leave" | AgendaMode>("leave");
  const win = useMonthWindow(2);
  const duration = useDuration();
  const today = todayRome();

  useEffect(() => { document.title = `Officine Mattio – ${t("fe.form.title")}`; }, [t]);

  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const span = (s: string, e: string) => (s === e ? fmt(s) : `${fmt(s)} → ${fmt(e)}`);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const submit = useMutation({
    mutationFn: () => ferieFormSubmit(token, { ...draft, hours: draft.part === "full" ? null : parseHours(draft.hours) }),
    onSuccess: () => { setDraft(empty()); setSent(true); refresh(); },
    onError: (e: { code?: string; message?: string; hint?: string }) => setError(
      e.hint === "blocked" ? e.message!.replace(/^blocked: /, `${t("fe.err.blocked")}: `)
        : e.code === "23P01" ? t("fe.err.overlap") : e.code === "53400" ? t("fe.err.busy") : t("fe.err.send")),
  });
  const cancel = useMutation({ mutationFn: (id: string) => ferieFormCancel(token, id), onSuccess: refresh });
  const answer = useMutation({ mutationFn: ({ id, accept }: { id: string; accept: boolean }) => ferieFormAnswer(token, id, accept), onSuccess: refresh });

  const preview = useMemo(() => {
    const d = data.data;
    if (!d || !draft.start_date || !draft.end_date || draft.end_date < draft.start_date) return null;
    return {
      peers: conflictsFor(d.me, draft.start_date, draft.end_date, d.employees, absences(d.leaves, d.events)),
      block: blockingEvent(d.me, draft.start_date, draft.end_date, d.events),
      duration: duration({ ...draft, hours: draft.part === "full" ? null : parseHours(draft.hours) || null }),
    };
  }, [data.data, draft]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateLeave(draft, today) ?? (preview?.block ? "fe.err.blocked" : null);
    setError(problem ? t(problem) : "");
    setSent(false);
    if (!problem) submit.mutate();
  };

  if (data.isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (data.isError || !data.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src="/logo.png" alt="Officine Mattio" className="h-7" />
        <p className="text-lg font-semibold">{t("fe.form.invalid")}</p>
        <p className="text-sm text-muted-foreground">{t("fe.form.invalidHint")}</p>
      </div>
    );
  }
  const d = data.data;
  const sn = sectorNamer(d.sectors ?? []);
  const sectors = [d.me.primary_sector, d.me.secondary_sector].filter(Boolean).map((s) => sn(s)).join(" + ");

  return (
    <SectorsProvider value={d.sectors ?? []}>
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2 shrink-0">
            <img src="/logo.png" alt="Officine Mattio" className="h-6 w-auto invert self-start" />
            <span className="tricolor h-0.5 w-12" aria-hidden="true" />
          </div>
          <span className="text-right text-sm"><span className="block font-semibold">{d.me.name}</span><span className="block text-white/70">{sectors}</span></span>
        </div>
      </header>

      {/* Mesma foto da prévia do WhatsApp: Alpes, lago e um avião */}
      <div className="relative h-56 sm:h-72 overflow-hidden bg-primary">
        <img src="/og-ferie-foto.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[70%_center]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
        <div className="relative max-w-5xl mx-auto h-full px-4 md:px-8 flex flex-col justify-end gap-2 pb-6 text-white">
          <h1 className="page-title text-white">{t("fe.form.title")}</h1>
          <p className="max-w-xl text-sm sm:text-base text-white/85">{t("fe.form.intro")}</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        <InstallHint storageKey="om-pwa-ferie-hidden" />

        {/* O que a pessoa quer registrar: férias/permesso, agenda ou furgão */}
        <div role="tablist" aria-label={t("fe.form.what")} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["leave", "travel", "external", "van"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={cn("min-h-11 rounded-full border px-3 text-sm font-semibold", mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground")}>
              {t(`fe.form.mode.${m}`)}
            </button>
          ))}
        </div>

        {mode !== "leave" ? (
          <Section title={t(`fe.form.mode.${mode}`)}>
            <AgendaForm key={mode} token={token} mode={mode} vans={d.vans ?? []} events={d.events} employees={d.employees} meId={d.me.id} onDone={refresh} />
          </Section>
        ) : (
        <form onSubmit={onSubmit} noValidate>
          <Section title={t("fe.form.new")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fe.from")}><Input type="date" min={today} value={draft.start_date} onChange={(e) => {
                const v = e.target.value;
                setDraft((x) => ({ ...x, start_date: v, end_date: !x.end_date || x.end_date < v ? v : x.end_date, part: x.end_date && x.end_date !== v ? "full" : x.part }));
              }} /></Field>
              <Field label={t("fe.to")}><Input type="date" min={draft.start_date || today} value={draft.end_date} onChange={(e) => {
                const v = e.target.value;
                setDraft((x) => ({ ...x, end_date: v, part: v !== x.start_date ? "full" : x.part }));
              }} /></Field>
            </div>
            <PartPicker value={draft.part} singleDay={!!draft.start_date && draft.start_date === draft.end_date} onChange={(part) => setDraft((x) => ({ ...x, part }))}
              hours={draft.hours} onHours={(hours) => setDraft((x) => ({ ...x, hours }))} />
            <Field label={`${t("fe.note")} (${t("fe.optional")})`}>
              <Textarea rows={2} value={draft.note} maxLength={1000} placeholder={t("fe.form.notePlaceholder")} onChange={(e) => setDraft((x) => ({ ...x, note: e.target.value }))} />
            </Field>

            {preview && (
              <div className="flex flex-col gap-1.5 text-sm">
                <p>{preview.duration}</p>
                {preview.block && (
                  <p className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />
                    {t("fe.blockedBy", { title: preview.block.title, dates: span(preview.block.start_date, preview.block.end_date) })}</p>
                )}
                {preview.peers.length > 0 && (
                  <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">
                    <p className="font-semibold">{t("fe.form.alsoAway")}</p>
                    {preview.peers.map((p, i) => <p key={i}>{p.employee.name} · {sn(p.sector)} · {span(p.start_date, p.end_date)}</p>)}
                    <p className="mt-1 text-muted-foreground">{t("fe.form.alsoAwayHint")}</p>
                  </div>
                )}
              </div>
            )}

            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            {sent && <p role="status" className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />{t("fe.form.sent")}</p>}
            <Button type="submit" size="lg" className="self-start" disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="animate-spin" />}{t("fe.form.send")}
            </Button>
          </Section>
        </form>
        )}

        <MyAgenda token={token} events={d.events} vans={d.vans ?? []} meId={d.me.id} employees={d.employees} onDone={refresh} />

        <Section title={t("fe.form.mine")}>
          {d.requests.length === 0 ? <p className="text-sm text-muted-foreground">{t("fe.form.none")}</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {d.requests.map((r: FormRequest) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{span(r.start_date, r.end_date)}</p>
                    <p className="text-muted-foreground">{duration(r)}{r.note && ` · “${r.note}”`}</p>
                    {r.status === "proposed" && r.proposed_start && <p className="mt-1 font-medium">{t("fe.form.proposed", { dates: span(r.proposed_start, r.proposed_end!) })}</p>}
                    {r.response_note && <p className="mt-1 text-muted-foreground">{t("fe.response")}: {r.response_note}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={r.status} />
                    {r.status === "proposed" && (
                      <>
                        <Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, accept: true })}>{t("fe.form.accept")}</Button>
                        <Button size="sm" variant="outline" disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, accept: false })}>{t("fe.form.decline")}</Button>
                      </>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => { if (window.confirm(t("fe.form.confirmCancel"))) cancel.mutate(r.id); }}>{t("fe.form.cancel")}</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("fe.form.team")}>
          <MonthNav win={win} />
          <LeaveMap from={win.first} days={win.days} today={win.today} employees={d.employees} leaves={d.leaves} events={d.events} vans={d.vans ?? []} meId={d.me.id} />
        </Section>
      </main>
    </div>
    </SectorsProvider>
  );
}

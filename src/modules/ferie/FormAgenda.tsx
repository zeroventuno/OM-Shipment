import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "@/modules/customers/fields";
import { ferieFormEvent, ferieFormEventCancel, type FormVan } from "./api";
import { Section } from "./parts";
import { daysBetween, overlaps, todayRome, type AgendaEvent } from "./logic";

/*
 * Pelo link pessoal: viagem de trabalho, reunião externa ou reserva de
 * furgão. Entra direto na agenda (sem aprovação). O furgão já ocupado na
 * mesma data é recusado pelo banco; aqui a tela já avisa antes.
 */

export type AgendaMode = "travel" | "external" | "van";

const empty = (van = "") => ({ title: "", start_date: "", end_date: "", start_time: "", end_time: "", van_id: van, notes: "" });

/** Reservas do mesmo furgão que batem com o rascunho (mesma regra do banco). */
export function vanTaken(events: AgendaEvent[], d: ReturnType<typeof empty>) {
  if (!d.van_id || !d.start_date || !d.end_date) return undefined;
  return events.find((ev) => ev.kind === "van" && ev.van_id === d.van_id && overlaps(d.start_date, d.end_date, ev.start_date, ev.end_date)
    && !(d.start_date === d.end_date && ev.start_date === ev.end_date && d.start_time && d.end_time && ev.start_time && ev.end_time
      && (d.end_time <= ev.start_time.slice(0, 5) || d.start_time >= ev.end_time.slice(0, 5))));
}

export function AgendaForm({ token, mode, vans, events, onDone }: {
  token: string; mode: AgendaMode; vans: FormVan[]; events: AgendaEvent[]; onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const today = todayRome();
  const [d, setD] = useState(() => empty(vans[0]?.id));
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const fmt = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "short" });
  const taken = mode === "van" ? vanTaken(events, d) : undefined;

  const submit = useMutation({
    mutationFn: () => ferieFormEvent(token, { ...d, kind: mode, van_id: mode === "van" ? d.van_id : "" }),
    onSuccess: () => { setD(empty(vans[0]?.id)); setSent(true); onDone(); },
    onError: (e: { code?: string; hint?: string }) => setError(t(e.hint === "van_taken" ? "fe.err.vanTaken" : e.code === "53400" ? "fe.err.busy" : "fe.err.send")),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSent(false);
    const problem = !d.title.trim() ? "fe.err.title"
      : !d.start_date || !d.end_date ? "fe.err.dates"
        : d.end_date < d.start_date ? "fe.err.order"
          : d.start_date < today ? "fe.err.past"
            : daysBetween(d.start_date, d.end_date) > 60 ? "fe.err.long"
              : d.start_date === d.end_date && d.start_time && d.end_time && d.end_time <= d.start_time ? "fe.err.times"
                : mode === "van" && !d.van_id ? "fe.err.van"
                  : taken ? "fe.err.vanTaken" : null;
    setError(problem ? t(problem) : "");
    if (!problem) submit.mutate();
  };

  if (mode === "van" && !vans.length) return <p className="text-sm text-muted-foreground">{t("fe.form.noVans")}</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {mode === "van" && (
        <Field label={t("fe.van")}>
          <div role="radiogroup" aria-label={t("fe.van")} className="flex flex-wrap gap-2">
            {vans.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={d.van_id === v.id} onClick={() => setD({ ...d, van_id: v.id })}
                className={cn("h-10 rounded-full border px-4 text-sm", d.van_id === v.id ? "border-foreground bg-secondary font-semibold" : "border-border bg-card")}>
                {v.name}{v.plate ? ` · ${v.plate}` : ""}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label={t("fe.eventTitle")}>
        <Input value={d.title} maxLength={120} placeholder={t(`fe.titleExample.${mode}`)} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fe.from")}><Input type="date" min={today} value={d.start_date} onChange={(e) => {
          const v = e.target.value;
          setD((x) => ({ ...x, start_date: v, end_date: !x.end_date || x.end_date < v ? v : x.end_date }));
        }} /></Field>
        <Field label={t("fe.to")}><Input type="date" min={d.start_date || today} value={d.end_date} onChange={(e) => setD({ ...d, end_date: e.target.value })} /></Field>
        <Field label={t("fe.startTime")}><Input type="time" value={d.start_time} onChange={(e) => setD({ ...d, start_time: e.target.value })} /></Field>
        <Field label={t("fe.endTime")}><Input type="time" value={d.end_time} onChange={(e) => setD({ ...d, end_time: e.target.value })} /></Field>
      </div>
      <Field label={`${t("fe.notes")} (${t("fe.optional")})`}>
        <Textarea rows={2} maxLength={1000} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </Field>
      {taken && <p className="text-sm font-medium text-destructive">{t("fe.form.vanTakenBy", { title: taken.title, from: fmt(taken.start_date), to: fmt(taken.end_date) })}</p>}
      {error && !taken && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {sent && <p role="status" className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />{t("fe.form.saved")}</p>}
      <Button type="submit" size="lg" className="self-start" disabled={submit.isPending || !!taken}>
        {submit.isPending && <Loader2 className="animate-spin" />}{t(mode === "van" ? "fe.form.bookVan" : "fe.form.addAgenda")}
      </Button>
    </form>
  );
}

/** Os registros da própria pessoa (agenda e furgões), com cancelar. */
export function MyAgenda({ token, events, vans, onDone }: { token: string; events: (AgendaEvent & { mine?: boolean })[]; vans: FormVan[]; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const today = todayRome();
  const cancel = useMutation({ mutationFn: (id: string) => ferieFormEventCancel(token, id), onSuccess: onDone });
  const mine = events.filter((e) => e.mine && e.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const fmt = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "short", day: "2-digit", month: "short" });
  if (!mine.length) return null;
  return (
    <Section title={t("fe.form.myAgenda")}>
      <ul className="flex flex-col divide-y divide-border">
        {mine.map((ev) => (
          <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold">{ev.title}</span>
              <span className="block text-muted-foreground">
                {t(`fe.kind.${ev.kind}`)}{ev.kind === "van" && ` · ${vans.find((v) => v.id === ev.van_id)?.name ?? ""}`}
                {" · "}{ev.start_date === ev.end_date ? fmt(ev.start_date) : `${fmt(ev.start_date)} → ${fmt(ev.end_date)}`}
                {ev.start_time && ` · ${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ""}`}
              </span>
            </span>
            <Button size="sm" variant="ghost" disabled={cancel.isPending}
              onClick={() => { if (window.confirm(t("fe.form.confirmCancelEvent"))) cancel.mutate(ev.id); }}>{t("fe.form.cancel")}</Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

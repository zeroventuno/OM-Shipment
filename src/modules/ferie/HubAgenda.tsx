import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIVE } from "@/lib/live";
import { AgentNumbers, Tile } from "@/modules/agents/AgentNumbers";
import { hubAgentStats, hubAgentsDashboard, yearChoices } from "@/modules/agents/api";
import { AgentsBoard } from "@/modules/agents/AgentsPage";
import type { FormData } from "./api";
import { Section, StatusChip, useDuration } from "./parts";
import { addDays, sectorsOf, todayRome, workingDays, type AgendaEvent, type LeaveStatus } from "./logic";

/*
 * Aba "Agenda" do link pessoal: o resumo da pessoa. Os próximos compromissos
 * (trasferte, riunioni, furgoni, date bloccate do setor e as férias), o estado
 * das férias e, para os comerciais, os próprios números (hub_agent_stats).
 */

const AHEAD_DAYS = 60;

type Row = { id: string; start: string; end: string; time?: string; label: string; title: string; detail: string; status?: LeaveStatus };

export function HubAgenda({ token, d, onOpenFerie }: { token: string; d: FormData; onOpenFerie: () => void }) {
  const { t, i18n } = useTranslation();
  const duration = useDuration();
  const today = todayRome();
  const until = addDays(today, AHEAD_DAYS);
  const meId = d.me.id;
  const mySectors = sectorsOf(d.me);
  const nameOf = (id: string) => d.employees.find((e) => e.id === id)?.name;
  const vanOf = (id?: string | null) => d.vans.find((v) => v.id === id)?.name;
  const fmt = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "short", day: "2-digit", month: "short" });

  const concerns = (ev: AgendaEvent & { mine?: boolean }) =>
    ev.mine || ev.employee_ids.includes(meId)
    || ((ev.kind === "block" || ev.kind === "meeting") && (!ev.sector || mySectors.includes(ev.sector)));

  const rows: Row[] = [
    ...d.events.filter((ev) => !ev.parent_id && ev.end_date >= today && ev.start_date <= until && concerns(ev)).map((ev): Row => {
      const others = ev.employee_ids.filter((id) => id !== meId).map(nameOf).filter(Boolean) as string[];
      const van = ev.kind === "van" ? vanOf(ev.van_id) : vanOf(d.events.find((x) => x.parent_id === ev.id)?.van_id);
      return {
        id: ev.id, start: ev.start_date, end: ev.end_date,
        time: ev.start_time ? `${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ""}` : undefined,
        label: t(`fe.kind.${ev.kind}`), title: ev.title,
        detail: [van && (ev.kind === "van" ? van : t("fe.form.withVan", { name: van })), others.length ? t("fe.form.withPeople", { names: others.join(", ") }) : ""].filter(Boolean).join(" · "),
      };
    }),
    ...d.requests.filter((r) => ["pending", "approved", "proposed"].includes(r.status) && r.end_date >= today && r.start_date <= until).map((r): Row => ({
      id: `l-${r.id}`, start: r.start_date, end: r.end_date, label: t("ag.agenda.leave"), title: duration(r), detail: r.note ?? "", status: r.status,
    })),
  ].sort((a, b) => a.start.localeCompare(b.start) || (a.time ?? "").localeCompare(b.time ?? ""));

  const year = Number(today.slice(0, 4));
  const pending = d.requests.filter((r) => r.status === "pending").length;
  const proposed = d.requests.filter((r) => r.status === "proposed").length;
  const approvedDays = d.requests.filter((r) => r.status === "approved" && r.start_date.startsWith(String(year)))
    .reduce((sum, r) => sum + (r.part === "full" ? workingDays(r) : 0.5), 0);

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("ag.agenda.next")}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("ag.agenda.none")}</p> : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.slice(0, 15).map((r) => (
              <li key={r.id} className="flex items-start gap-4 py-3 text-sm">
                <span className={cn("w-24 shrink-0 font-semibold tabular-nums", r.start <= today && "text-primary")}>
                  {r.start <= today ? t("ag.agenda.today") : fmt(r.start)}
                  {r.end !== r.start && <span className="block text-xs font-normal text-muted-foreground">→ {fmt(r.end)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block">{r.label}{r.time && ` · ${r.time}`}</span>
                  <span className="block font-semibold">{r.title}</span>
                  {r.detail && <span className="block text-muted-foreground">{r.detail}</span>}
                </span>
                {r.status && <StatusChip status={r.status} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("ag.agenda.ferie")}>
        <div className="grid grid-cols-3 gap-3">
          <Tile label={t("ag.agenda.pending")} value={String(pending)} />
          <Tile label={t("ag.agenda.proposed")} value={String(proposed)} />
          <Tile label={t("ag.agenda.approvedYear", { year })} value={String(approvedDays).replace(".", ",")} />
        </div>
        <button type="button" onClick={onOpenFerie} className="self-start text-sm font-semibold underline underline-offset-4">{t("ag.agenda.open")}</button>
      </Section>

      <HubNumbers token={token} />
    </div>
  );
}

/** Números do agente: só aparece para os comerciais e para quem já tem envios ou casos no nome.
 *  O dono (owner) tem duas abas: os próprios números e os de todos os agentes. */
function HubNumbers({ token }: { token: string }) {
  const { t } = useTranslation();
  const years = yearChoices();
  const [year, setYear] = useState(years[0]);
  const [tab, setTab] = useState<"mine" | "agents">("mine");
  const q = useQuery({ queryKey: ["hub-agent-stats", token, year], queryFn: () => hubAgentStats(token, year), ...LIVE });
  if (q.isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (q.isError) return <p className="text-sm text-muted-foreground">{t("ag.error")}</p>;
  if (!q.data?.show) return null;
  const owner = q.data.owner === true;
  return (
    <Section title={t(owner ? "ag.numbersTitle" : "ag.numbers")}>
      {owner && (
        <div role="tablist" aria-label={t("ag.numbersTitle")} className="grid grid-cols-2 gap-2 sm:w-96">
          {(["mine", "agents"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("min-h-11 rounded-full border px-3 text-sm font-semibold", tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground")}>
              {t(k === "mine" ? "ag.tab.mine" : "ag.tab.agents")}
            </button>
          ))}
        </div>
      )}
      {owner && tab === "agents" ? (
        <AgentsBoard load={(y) => hubAgentsDashboard(token, y)} queryKey={["hub-agents", token]} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("ag.numbersHint")}</p>
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow">{t("ag.year")}</span>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-10 rounded-full border border-border bg-card px-4 text-sm font-semibold tabular-nums">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <AgentNumbers me={q.data.me} om={q.data.om} />
        </>
      )}
    </Section>
  );
}

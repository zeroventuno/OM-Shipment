import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIVE } from "@/lib/live";
import { formatMoney } from "@/modules/requests/api";
import { PageHeader } from "@/modules/common/PageHeader";
import { AgentNumbers, Tile } from "./AgentNumbers";
import { agentsDashboard, yearChoices, type DashboardAgent } from "./api";
import { pctText } from "./format";

/*
 * Painel Agenti (/agents), para o dono (área Report): a classificação de todos
 * os agentes e, embaixo, o detalhe de cada um com o mesmo bloco que o agente
 * vê no próprio link. Os números vêm de agents_dashboard(year).
 */

type SortKey = "n" | "profit" | "warranties";

const value = (a: DashboardAgent, k: SortKey) =>
  k === "n" ? a.stats.shipments.n : k === "profit" ? a.stats.shipments.profit : a.stats.warranties.total;

export default function AgentsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const years = yearChoices();
  const [year, setYear] = useState(years[0]);
  const [sort, setSort] = useState<SortKey>("n");
  const q = useQuery({ queryKey: ["agents-dashboard", year], queryFn: () => agentsDashboard(year), ...LIVE });

  const ranked = useMemo(() => {
    const list = [...(q.data?.agents ?? [])];
    // saldo: o menor prejuízo primeiro; os outros: o maior primeiro
    return list.sort((a, b) => value(b, sort) - value(a, sort) || a.name.localeCompare(b.name));
  }, [q.data, sort]);

  const om = q.data?.om;
  const select = "h-10 rounded-full border border-border bg-card px-4 text-sm font-semibold";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("ag.page.eyebrow")}
        title={t("ag.page.title")}
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="eyebrow">{t("ag.year")}</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={cn(select, "tabular-nums")}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        }
      />
      <p className="-mt-3 text-sm text-muted-foreground">{t("ag.page.intro")}</p>

      {q.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : q.isError || !om ? (
        <p className="py-16 text-center text-destructive">{(q.error as { code?: string })?.code === "42501" ? t("ag.page.denied") : t("ag.error")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t("ag.page.omShipments")} value={String(om.n)} hint={`${om.with_agent} ${t("ag.page.withAgent")} (${pctText(om.with_agent, om.n, lang)})`} />
            <Tile label={t("ag.page.omBalance")} value={formatMoney(om.profit, lang)} tone={om.profit < 0 ? "bad" : "good"} />
            <Tile label={t("ag.warranties")} value={String(om.warranties_open)} hint={t("ag.page.openNow")} />
            <Tile label={t("ag.tickets")} value={String(om.tickets_open)} hint={t("ag.page.openNow")} />
          </div>
          {om.with_agent < om.n && (
            <p className="rounded-lg border border-border bg-secondary/60 px-4 py-3 text-sm">{t("ag.page.coverage", { with: om.with_agent, n: om.n, year: q.data!.year })}</p>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("ag.page.ranking")}</h2>
              <label className="flex items-center gap-2 text-sm">
                <span className="eyebrow">{t("ag.page.sortBy")}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={select}>
                  {(["n", "profit", "warranties"] as const).map((k) => <option key={k} value={k}>{t(`ag.page.sort.${k}`)}</option>)}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-10 px-4 py-3">#</th>
                    <th className="px-3 py-3">{t("ag.page.agent")}</th>
                    <th className="px-3 py-3 text-right">{t("ag.shipments")}</th>
                    <th className="px-3 py-3 text-right">{t("ag.share")}</th>
                    <th className="px-3 py-3 text-right">{t("ag.balance")}</th>
                    <th className="px-3 py-3 text-right">{t("ag.warranties")}</th>
                    <th className="px-4 py-3 text-right">{t("ag.tickets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((a, i) => {
                    const s = a.stats;
                    return (
                      <tr key={a.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-3 font-semibold"><a href={`#agent-${a.id}`} className="hover:underline">{a.name}</a></td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold">{s.shipments.n}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{pctText(s.shipments.n, om.n, lang)}</td>
                        <td className={cn("px-3 py-3 text-right tabular-nums", s.shipments.profit < 0 && "text-destructive")}>{formatMoney(s.shipments.profit, lang)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{s.warranties.open}/{s.warranties.total}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{s.tickets.open}/{s.tickets.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("ag.page.legend")}</p>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("ag.page.detail")}</h2>
            {ranked.map((a) => (
              <article key={a.id} id={`agent-${a.id}`} className="flex scroll-mt-20 flex-col gap-3">
                <h3 className="text-xl font-bold tracking-tight">{a.name}</h3>
                <AgentNumbers me={a.stats} om={om} />
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

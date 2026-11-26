import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DashboardAgent, TypeRow } from "./api";
import { pctText, useTypeLabel } from "./format";

/*
 * Envios por tipo: a barra cinza é o total da OM; na frente, um pedaço
 * colorido por agente, todos na mesma escala. A cor segue o agente (ordem
 * alfabética, fixa), nunca a posição no ranking. Paleta categórica validada
 * para daltonismo (skill dataviz); mais de 8 agentes viram "Altri" em cinza.
 */

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const OTHER = "#8a8984";

export function AgentsByType({ agents, omByType }: { agents: DashboardAgent[]; omByType: TypeRow[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const typeLabel = useTypeLabel();

  // só quem tem envios no ano; cor pela ordem do nome
  const withShips = agents.filter((a) => a.stats.shipments.n > 0).sort((a, b) => a.name.localeCompare(b.name));
  const series = withShips.slice(0, SERIES.length).map((a, i) => ({ key: a.id, name: a.name, color: SERIES[i], agents: [a] }));
  if (withShips.length > SERIES.length) series.push({ key: "other", name: t("ag.page.others"), color: OTHER, agents: withShips.slice(SERIES.length) });

  const countOf = (list: DashboardAgent[], type: string) =>
    list.reduce((sum, a) => sum + (a.stats.shipments.by_type.find((r) => r.type === type)?.n ?? 0), 0);
  const rows = omByType.filter((r) => r.n > 0).map((r) => ({
    type: r.type, total: r.n,
    parts: series.map((s) => ({ ...s, n: countOf(s.agents, r.type) })).filter((p) => p.n > 0),
  })).map((r) => ({ ...r, tagged: r.parts.reduce((s, p) => s + p.n, 0) }))
    .sort((a, b) => b.tagged - a.tagged || b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  if (series.length === 0) return null;
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("ag.byType")}</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label={t("ag.page.legendTitle")}>
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</li>
          ))}
          <li className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm bg-muted" />{t("ag.omTotal")}</li>
        </ul>
      </div>
      <ul className="flex flex-col gap-3.5">
        {rows.map((r) => {
          const label = `${typeLabel(r.type)}: ${r.parts.map((p) => `${p.name} ${p.n}`).join(", ") || "—"} · ${t("ag.omTotal")} ${r.total}`;
          return (
            <li key={r.type} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{typeLabel(r.type)}</span>
                <span className="shrink-0 tabular-nums"><strong>{r.tagged}</strong><span className="text-muted-foreground"> / {r.total} · {pctText(r.tagged, r.total, lang)}</span></span>
              </div>
              <div role="img" aria-label={label} className="relative h-3.5 overflow-hidden rounded-full bg-transparent">
                <span className="absolute inset-y-0 left-0 rounded-full bg-muted" style={{ width: `${(r.total / max) * 100}%` }} />
                {/* um pedaço por agente, um atrás do outro, com 2px de folga entre eles */}
                {r.parts.map((p, i) => {
                  const before = r.parts.slice(0, i).reduce((sum, x) => sum + x.n, 0);
                  const last = i === r.parts.length - 1;
                  return (
                    <span key={p.key} title={`${p.name}: ${p.n}`}
                      className={cn("absolute inset-y-0 border-r-2 border-card", i === 0 && "rounded-l-full", last && "rounded-r-full")}
                      style={{ background: p.color, left: `${(before / max) * 100}%`, width: `max(6px, ${(p.n / max) * 100}%)` }} />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

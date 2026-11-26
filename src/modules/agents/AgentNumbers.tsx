import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/modules/requests/api";
import { PHASE_LABELS, WARRANTY_STATUS_LABELS } from "@/modules/labels";
import type { AgentStats, OmCounts } from "./api";
import { pctText, useTypeLabel } from "./format";

/*
 * Os números de um agente: envios (com a parte dele no total da OM), saldo,
 * garantias e assistências, e os envios por tipo lado a lado com a OM.
 * O mesmo bloco aparece no link pessoal e no painel Agenti do dono.
 */

export function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="eyebrow">{label}</span>
      <span className={cn("break-words text-xl font-bold tabular-nums tracking-tight sm:text-2xl", tone === "bad" && "text-destructive", tone === "good" && "text-[#1F7A3A]")}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function AgentNumbers({ me, om }: { me: AgentStats; om: OmCounts }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const typeLabel = useTypeLabel();
  const s = me.shipments;
  // todos os tipos da OM, os do agente primeiro
  const mine = new Map(s.by_type.map((r) => [r.type, r]));
  const rows = [...new Set([...s.by_type.map((r) => r.type), ...om.by_type.map((r) => r.type)])]
    .map((type) => ({ type, n: mine.get(type)?.n ?? 0, profit: mine.get(type)?.profit ?? 0, total: om.by_type.find((r) => r.type === type)?.n ?? mine.get(type)?.n ?? 0 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.n - a.n || b.total - a.total);
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const statusList = (m: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${labels[k] ? t(labels[k]) : k || "—"} ${n}`).join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("ag.shipments")} value={String(s.n)} hint={t("ag.shareOf", { pct: pctText(s.n, om.n, lang), n: om.n })} />
        <Tile label={t("ag.balance")} value={formatMoney(s.profit, lang)} hint={t("ag.balanceHint")} tone={s.profit < 0 ? "bad" : s.profit > 0 ? "good" : undefined} />
        <Tile label={t("ag.warranties")} value={String(me.warranties.total)} hint={t("ag.openOf", { open: me.warranties.open, total: me.warranties.total })} />
        <Tile label={t("ag.tickets")} value={String(me.tickets.total)} hint={t("ag.openOf", { open: me.tickets.open, total: me.tickets.total })} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <h3 className="px-4 pt-4 text-xs font-bold uppercase tracking-[0.12em]">{t("ag.byType")}</h3>
        {s.n === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">{t("ag.none")}</p> : (
          <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden="true">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />{t("ag.mine")}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted" />{t("ag.omTotal")}</span>
            </div>
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const label = `${typeLabel(r.type)}: ${t("ag.barOf", { n: r.n, total: r.total, pct: pctText(r.n, r.total, lang) })}`;
                return (
                  <li key={r.type} className="flex flex-col gap-1" title={`${label} · ${t("ag.balance")} ${formatMoney(r.profit, lang)}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{typeLabel(r.type)}</span>
                      <span className="shrink-0 tabular-nums"><strong>{r.n}</strong><span className="text-muted-foreground"> / {r.total} · {pctText(r.n, r.total, lang)}</span></span>
                    </div>
                    {/* OM atrás, o agente na frente, na mesma escala */}
                    <div role="img" aria-label={label} className="relative h-3 overflow-hidden rounded-full">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-muted" style={{ width: `${(r.total / maxTotal) * 100}%` }} />
                      {r.n > 0 && <span className="absolute inset-y-0 left-0 rounded-full bg-primary ring-2 ring-card" style={{ width: `max(6px, ${(r.n / maxTotal) * 100}%)` }} />}
                    </div>
                    {r.n > 0 && <span className={cn("text-xs tabular-nums", r.profit < 0 ? "text-destructive" : "text-muted-foreground")}>{t("ag.balance")}: {formatMoney(r.profit, lang)}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {(me.warranties.total > 0 || me.tickets.total > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          {me.warranties.total > 0 && (
            <p className="rounded-lg border border-border bg-card px-4 py-3"><span className="eyebrow block">{t("ag.warranties")} · {t("ag.byStatus")}</span>{statusList(me.warranties.by_status, WARRANTY_STATUS_LABELS)}</p>
          )}
          {me.tickets.total > 0 && (
            <p className="rounded-lg border border-border bg-card px-4 py-3"><span className="eyebrow block">{t("ag.tickets")} · {t("ag.byStatus")}</span>{statusList(me.tickets.by_phase, PHASE_LABELS)}</p>
          )}
        </div>
      )}
    </div>
  );
}

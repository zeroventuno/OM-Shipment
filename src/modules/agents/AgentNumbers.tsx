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
      <span className={cn("text-2xl font-bold tabular-nums tracking-tight", tone === "bad" && "text-destructive", tone === "good" && "text-[#1F7A3A]")}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function AgentNumbers({ me, om }: { me: AgentStats; om: OmCounts }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const typeLabel = useTypeLabel();
  const s = me.shipments;
  const omType = new Map(om.by_type.map((r) => [r.type, r.n]));
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-semibold">{t("ag.type")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("ag.mine")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("ag.om")}</th>
                  <th className="hidden px-3 py-2 font-semibold sm:table-cell">{t("ag.share")}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t("ag.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {s.by_type.map((r) => {
                  const total = omType.get(r.type) ?? 0;
                  const share = total ? r.n / total : 0;
                  return (
                    <tr key={r.type} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-medium">{typeLabel(r.type)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.n}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{total}</td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${Math.max(share * 100, 2)}%` }} /></span>
                          <span className="text-xs tabular-nums text-muted-foreground">{pctText(r.n, total, lang)}</span>
                        </span>
                      </td>
                      <td className={cn("px-4 py-2.5 text-right tabular-nums", (r.profit ?? 0) < 0 && "text-destructive")}>{formatMoney(r.profit ?? 0, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

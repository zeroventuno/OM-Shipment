import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { countryLabel } from "@/modules/shipments/data/countries";
import { TrackingInfo } from "./TrackingInfo";
import { boxSummary, formatMoney, totalWeight, type PublicRequest } from "./api";

/*
 * Cartão de pedido no mesmo formato da tela interna Richieste di spedizione:
 * data · quem pediu em cima, o nome do cliente grande, o destino, as caixas,
 * fatturato, numero ordine e, quando já foi enviado, o tracking com o link.
 * Usado na aba Elenco do formulário e em "Le mie richieste" do link pessoal.
 */

export type CardTone = "done" | "off" | "open";

export function RequestCard({ at, by, tag, title, status, tone, children }: {
  at: string;
  /** quem pediu (aparece ao lado da data) */
  by?: string | null;
  /** tipo: Spedizione, Ritiro, Garanzia… */
  tag?: string;
  title: string;
  status: string;
  tone: CardTone;
  children?: ReactNode;
}) {
  const locale = useDateLocale();
  return (
    <article className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="eyebrow">
            {format(new Date(at), "dd/MM/yyyy HH:mm", { locale })}
            {by ? ` · ${by}` : ""}
            {tag ? ` · ${tag}` : ""}
          </span>
          <h2 className="text-xl font-bold tracking-tight break-words">{title}</h2>
        </div>
        <span className={cn("shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em]",
          tone === "done" ? "bg-primary text-primary-foreground" : tone === "off" ? "bg-muted text-muted-foreground line-through" : "border border-foreground")}>
          {status}
        </span>
      </div>
      {children}
    </article>
  );
}

/** Corpo do cartão de um envio: destino, caixas, valores, ordem, data e tracking. */
export function ShipmentDetails({ r }: { r: PublicRequest & { city?: string | null } }) {
  const { t, i18n } = useTranslation();
  const locale = useDateLocale();
  const place = [r.city, r.country ? countryLabel(r.country, i18n.language || "it") : null].filter(Boolean).join(", ");
  const shipped = r.status === "shipped";
  return (
    <>
      {place && <p className="text-sm">{place}</p>}
      <div className="flex flex-col gap-1 pt-3 border-t border-muted text-sm">
        {r.boxes.length === 0 ? (
          r.source !== "manual" && <p className="font-semibold">{t("Packaging to be defined")}</p>
        ) : (
          <>
            {r.boxes.map((b, i) => (
              <p key={i}><span className="text-muted-foreground">{t("Box")} {i + 1}:</span> {boxSummary(b)}</p>
            ))}
            <p className="font-semibold">{t("Total")}: {r.boxes.length} × · {totalWeight(r.boxes)} kg</p>
          </>
        )}
        {r.invoice_value != null && (
          <p>
            <span className="text-muted-foreground">{t("Invoiced")}:</span> {formatMoney(r.invoice_value, i18n.language)}
            {" · "}
            {r.insured_value
              ? <><span className="text-muted-foreground">{t("Insured")}:</span> <strong>{formatMoney(r.insured_value, i18n.language)}</strong></>
              : <span className="text-muted-foreground">{t("No insurance")}</span>}
          </p>
        )}
        {r.order_ref && <p><span className="text-muted-foreground">{t("Order Number")}:</span> {r.order_ref}</p>}
        {shipped && r.shipped_at && (
          <p><span className="text-muted-foreground">{t("Shipping date")}:</span> {format(new Date(r.shipped_at), "dd/MM/yyyy", { locale })}</p>
        )}
        {r.service_level === "express" && <p className="font-semibold">{t("Express")}</p>}
      </div>
      {shipped && <TrackingInfo carrier={r.carrier} code={r.tracking_code} />}
    </>
  );
}

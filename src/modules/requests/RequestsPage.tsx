import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { PageHeader } from "../common/PageHeader";
import { listRequests, setRequestStatus, formatAddress, formatMoney, boxSummary, totalWeight, quoteCarrier, REQUESTS_QUERY_KEY, type ShipmentRequest, type Customer } from "./api";
import { TrackingInfo } from "./TrackingInfo";
import CustomerDialog from "./CustomerDialog";
import { LIVE } from "@/lib/live";

type Filter = "pending" | "shipped" | "cancelled";

export default function RequestsPage() {
  const { t, i18n } = useTranslation();
  const locale = useDateLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");
  const [customerOpen, setCustomerOpen] = useState<Customer | null>(null);

  const { data: requests = [], isLoading, error } = useQuery({ queryKey: REQUESTS_QUERY_KEY, queryFn: listRequests, ...LIVE });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShipmentRequest["status"] }) => setRequestStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REQUESTS_QUERY_KEY }),
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });

  const counts = {
    pending: requests.filter((r) => r.status === "pending").length,
    shipped: requests.filter((r) => r.status === "shipped").length,
    cancelled: requests.filter((r) => r.status === "cancelled").length,
  };
  const visible = requests.filter((r) => r.status === filter);
  const labels: Record<Filter, string> = { pending: t("Waiting"), shipped: t("Shipped"), cancelled: t("Cancelled") };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("Copied") });
    } catch {
      // Sem permissão de área de transferência: nada a fazer.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("nav.shipments")} title={t("Shipment requests")} />

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Status")}>
        {(["pending", "shipped", "cancelled"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("h-9 px-4 rounded-full border text-[11px] font-semibold uppercase tracking-[0.1em]",
              filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-foreground")}
          >
            {labels[f]} · {counts[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">…</p>
      ) : error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("Nothing here")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((r) => {
            // Endereço de entrega escolhido no pedido (antigos: o do cadastro).
            const address = formatAddress(r.address ?? r.customer);
            const contact = r.address
              ? [r.address.contact_name, r.address.phone]
              : [r.customer.contact_name, r.customer.phone];
            return (
              <article key={r.id} className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="eyebrow">
                      {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale })} · {r.requested_by}
                    </span>
                    <h2 className="text-xl font-bold tracking-tight break-words">
                      <button
                        type="button"
                        onClick={() => setCustomerOpen(r.customer)}
                        className="text-left underline decoration-border underline-offset-4 hover:decoration-foreground"
                        title={t("Customer details")}
                      >
                        {r.customer.name}
                      </button>
                    </h2>
                  </div>
                  {r.service_level === "express" && (
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">
                      {t("Express")}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 text-sm">
                  {r.address?.label && <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{r.address.label}</p>}
                  <div className="flex items-start gap-2">
                    <p className="flex-1">{address || <span className="text-muted-foreground">{t("No address registered")}</span>}</p>
                    {address && (
                      <button type="button" onClick={() => copy(address)} aria-label={t("Copy address")} className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center hover:bg-secondary">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {[...contact, r.customer.email].some(Boolean) && (
                    <p className="text-muted-foreground">{[...contact, r.customer.email].filter(Boolean).join(" · ")}</p>
                  )}
                  {r.customer.tax_id && <p className="text-muted-foreground">{t("Tax ID")}: {r.customer.tax_id}</p>}
                </div>

                <div className="flex flex-col gap-1 pt-3 border-t border-muted text-sm">
                  {r.boxes.length === 0 ? (
                    <p className="font-semibold">{t("Packaging to be defined")}</p>
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
                  {r.notes && <p className="whitespace-pre-line text-foreground/80">{r.notes}</p>}
                </div>

                {r.status === "shipped" && (
                  <TrackingInfo carrier={quoteCarrier(r.shipment?.selected_quote)} code={r.shipment?.tracking_code || null} />
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === "pending" && (
                    <>
                      <Button asChild>
                        <Link to={`/shipments/new?request=${r.id}`}>{t("Create shipment")}</Link>
                      </Button>
                      <Button variant="outline" onClick={() => window.confirm(t("Cancel this request?")) && statusMutation.mutate({ id: r.id, status: "cancelled" })}>
                        {t("Cancel request")}
                      </Button>
                    </>
                  )}
                  {r.status === "shipped" && r.shipment_id && (
                    <Button asChild variant="outline"><Link to={`/shipments/${r.shipment_id}`}>{t("Open shipment")}</Link></Button>
                  )}
                  {r.status === "cancelled" && (
                    <Button variant="outline" onClick={() => statusMutation.mutate({ id: r.id, status: "pending" })}>{t("Reopen")}</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CustomerDialog customer={customerOpen} onClose={() => setCustomerOpen(null)} />
    </div>
  );
}

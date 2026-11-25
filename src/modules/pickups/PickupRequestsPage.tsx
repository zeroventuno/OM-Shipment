import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { countryLabel } from "@/modules/shipments/data/countries";
import { PageHeader } from "../common/PageHeader";
import { boxSummary, totalWeight } from "../requests/api";
import { PICKUP_REQUESTS_QUERY_KEY, listPickupRequests, pickupAddress, setPickupStatus, type PickupRequest } from "./api";
import { LIVE } from "@/lib/live";

type Filter = PickupRequest["status"];

/** Fila dos pedidos de retirada feitos por lojas e parceiros externos. */
export default function PickupRequestsPage() {
  const { t, i18n } = useTranslation();
  const locale = useDateLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("new");

  const { data: requests = [], isLoading, error } = useQuery({ queryKey: PICKUP_REQUESTS_QUERY_KEY, queryFn: listPickupRequests, ...LIVE });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "new" | "rejected" }) => setPickupStatus(id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PICKUP_REQUESTS_QUERY_KEY }),
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });

  const labels: Record<Filter, string> = { new: t("pk.new"), converted: t("pk.converted"), rejected: t("pk.rejected") };
  const visible = requests.filter((r) => r.status === filter);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: t("Copied") }); } catch { /* sem permissão */ }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("pk.eyebrow")} title={t("pk.title")} />

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Status")}>
        {(["new", "converted", "rejected"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={cn("h-9 px-4 rounded-full border text-[11px] font-semibold uppercase tracking-[0.1em]",
              filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-foreground")}>
            {labels[f]} · {requests.filter((r) => r.status === f).length}
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
            const address = pickupAddress({ ...r, country: countryLabel(r.country, i18n.language) });
            return (
              <article key={r.id} className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="eyebrow">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale })} · {r.code}</span>
                    <h2 className="text-xl font-bold tracking-tight break-words">{r.shop_name}</h2>
                  </div>
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full border border-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {t(`pk.reason.${r.reason}`)}
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex items-start gap-2">
                    <p className="flex-1">{address}</p>
                    <button type="button" onClick={() => copy(address)} aria-label={t("Copy address")} className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center hover:bg-secondary">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-muted-foreground">{[r.contact_name, r.phone, r.email].join(" · ")}</p>
                  <p>
                    <span className="text-muted-foreground">{t("pk.readyFrom")}:</span> {format(new Date(`${r.ready_from}T00:00:00`), "dd/MM/yyyy", { locale })}
                    {r.opening_hours && <> · <span className="text-muted-foreground">{t("pk.hours")}:</span> {r.opening_hours}</>}
                  </p>
                </div>

                <div className="flex flex-col gap-1 pt-3 border-t border-muted text-sm">
                  <p className="whitespace-pre-line font-medium">{r.description}</p>
                  {r.reference && <p><span className="text-muted-foreground">{t("pk.reference")}:</span> {r.reference}</p>}
                  {r.boxes.length === 0 ? (
                    <p className="text-muted-foreground">{t("pk.boxesTbd")}</p>
                  ) : (
                    <>
                      {r.boxes.map((b, i) => <p key={i}><span className="text-muted-foreground">{t("Box")} {i + 1}:</span> {boxSummary(b)}</p>)}
                      <p className="font-semibold">{t("Total")}: {r.boxes.length} × · {totalWeight(r.boxes)} kg</p>
                    </>
                  )}
                  {r.notes && <p className="whitespace-pre-line text-foreground/80">{r.notes}</p>}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === "new" && (
                    <>
                      <Button asChild><Link to={`/shipments/new?pickup=${r.id}`}>{t("pk.createPickup")}</Link></Button>
                      <Button variant="outline" onClick={() => window.confirm(t("pk.rejectConfirm")) && status.mutate({ id: r.id, value: "rejected" })}>
                        {t("pk.reject")}
                      </Button>
                    </>
                  )}
                  {r.status === "converted" && r.shipment_id && (
                    <Button asChild variant="outline"><Link to={`/shipments/${r.shipment_id}`}>{t("pk.openShipment")}</Link></Button>
                  )}
                  {r.status === "rejected" && (
                    <Button variant="outline" onClick={() => status.mutate({ id: r.id, value: "new" })}>{t("pk.reopen")}</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

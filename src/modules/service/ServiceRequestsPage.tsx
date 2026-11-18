import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { PageHeader } from "../common/PageHeader";
import TicketModal from "../assistance/TicketModal";
import WarrantyModal from "../warranties/WarrantyModal";
import { TICKETS_QUERY_KEY, createTicket } from "../assistance/api";
import { WARRANTIES_QUERY_KEY, createWarranty } from "../warranties/api";
import type { InsertTicket, InsertWarranty } from "../schema";
import {
  SERVICE_REQUESTS_QUERY_KEY, copyPhotosToWarranty, listServiceRequests, markServiceRequestConverted,
  setServiceRequestStatus, signedFileUrls, type ServiceRequest,
} from "./api";
import { requestNotes, ticketPrefill, warrantyPrefill, type ServiceKind } from "./intake";

type Filter = ServiceRequest["status"];

function RequestFiles({ request }: { request: ServiceRequest }) {
  const { t } = useTranslation();
  const urls = useQuery({
    queryKey: [...SERVICE_REQUESTS_QUERY_KEY, "files", request.id],
    queryFn: () => signedFileUrls(request.files),
    enabled: request.files.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  if (!request.files.length) return null;
  const groups = [["photos", t("svc.photos")], ["receipt", t("svc.receipt")]] as const;
  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-muted">
      {groups.map(([folder, label]) => {
        const files = request.files.filter((f) => f.folder === folder);
        if (!files.length) return null;
        return (
          <div key={folder} className="flex flex-col gap-1.5">
            <span className="eyebrow">{label}</span>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => {
                const url = urls.data?.[f.path];
                const name = `${label} ${i + 1}`;
                return (
                  <a key={f.path} href={url} target="_blank" rel="noreferrer" aria-label={name}
                    className="h-20 w-20 rounded-md border border-border overflow-hidden flex items-center justify-center bg-secondary">
                    {url && f.mime?.startsWith("image/") && !/hei[cf]/.test(f.mime)
                      ? <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" />
                      : <FileText className="h-5 w-5" />}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ServiceRequestsPage() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("new");
  const [opening, setOpening] = useState<{ request: ServiceRequest; kind: ServiceKind } | null>(null);

  const { data: requests = [], isLoading, error } = useQuery({ queryKey: SERVICE_REQUESTS_QUERY_KEY, queryFn: listServiceRequests });
  const refresh = () => queryClient.invalidateQueries({ queryKey: SERVICE_REQUESTS_QUERY_KEY });
  const onError = (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" });

  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "new" | "rejected" }) => setServiceRequestStatus(id, value),
    onSuccess: refresh,
    onError,
  });

  const finish = () => {
    setOpening(null);
    refresh();
    toast({ title: t("svc.created") });
  };

  const openTicket = useMutation({
    mutationFn: async (data: InsertTicket) => {
      const ticket = await createTicket(data);
      await markServiceRequestConverted(opening!.request.id, { ticket_id: ticket.id });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY }); finish(); },
    onError,
  });

  const openWarranty = useMutation({
    mutationFn: async (data: InsertWarranty) => {
      const photos = await copyPhotosToWarranty(opening!.request.files);
      const warranty = await createWarranty({ ...data, images: [...(data.images ?? []), ...photos] });
      await markServiceRequestConverted(opening!.request.id, { warranty_id: warranty.id });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: WARRANTIES_QUERY_KEY }); finish(); },
    onError,
  });

  const labels: Record<Filter, string> = { new: t("svc.new"), converted: t("svc.converted"), rejected: t("svc.rejected") };
  const visible = requests.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("svc.eyebrow")} title={t("svc.title")} />

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
            const details = requestNotes({ ...r, code: null });
            const other: ServiceKind = r.kind === "warranty" ? "assistance" : "warranty";
            return (
              <article key={r.id} className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="eyebrow">{r.code} · {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale })}</span>
                    <h2 className="text-xl font-bold tracking-tight break-words">{r.customer_name}</h2>
                    <a href={`mailto:${r.email}`} className="text-sm underline underline-offset-4 break-all">{r.email}</a>
                  </div>
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full border border-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {t(r.kind === "warranty" ? "svc.warranty" : "svc.assistance")}
                  </span>
                </div>

                <div className="flex flex-col gap-1 pt-3 border-t border-muted text-sm">
                  <p className="font-semibold break-words">{[r.brand, r.product, r.size].filter(Boolean).join(" · ")}</p>
                  {r.serial_number && <p><span className="text-muted-foreground">{t("Serial number")}:</span> {r.serial_number}</p>}
                  <p className="whitespace-pre-line break-words pt-1">{r.problem}</p>
                  {details && <p className="whitespace-pre-line text-muted-foreground pt-1">{details}</p>}
                </div>

                <RequestFiles request={r} />

                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === "new" && (
                    <>
                      <Button onClick={() => setOpening({ request: r, kind: r.kind })}>
                        {t(r.kind === "warranty" ? "svc.createWarranty" : "svc.createAssistance")}
                      </Button>
                      <Button variant="outline" onClick={() => setOpening({ request: r, kind: other })}>
                        {t(other === "warranty" ? "svc.asWarranty" : "svc.asAssistance")}
                      </Button>
                      <Button variant="outline" onClick={() => window.confirm(t("svc.rejectConfirm")) && status.mutate({ id: r.id, value: "rejected" })}>
                        {t("svc.reject")}
                      </Button>
                    </>
                  )}
                  {r.status === "converted" && (r.ticket_id || r.warranty_id) && (
                    <Button asChild variant="outline">
                      <Link to={r.ticket_id ? `/assistance/${r.ticket_id}` : `/warranties/${r.warranty_id}`}>{t("svc.openProcess")}</Link>
                    </Button>
                  )}
                  {r.status === "rejected" && (
                    <Button variant="outline" onClick={() => status.mutate({ id: r.id, value: "new" })}>{t("Reopen")}</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {opening?.kind === "assistance" && (
        <TicketModal key={opening.request.id} open onClose={() => setOpening(null)} prefill={ticketPrefill(opening.request)}
          onSubmit={(data) => openTicket.mutate(data)} isLoading={openTicket.isPending} />
      )}
      {opening?.kind === "warranty" && (
        <WarrantyModal key={opening.request.id} open onClose={() => setOpening(null)} warranty={null} prefill={warrantyPrefill(opening.request)}
          onSubmit={(data) => openWarranty.mutate(data)} isLoading={openWarranty.isPending} />
      )}
    </div>
  );
}

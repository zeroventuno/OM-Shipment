import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { WARRANTY_STATUSES, type Warranty, type InsertWarranty } from "../schema";
import { WARRANTY_STATUS_LABELS, SOLUTION_LABELS, PROCESS_TYPE_LABELS } from "../labels";
import { BackLink, DetailCard, FactList, StageStepper } from "../common/Detail";
import TicketHistory from "../assistance/TicketHistory";
import WarrantyModal from "./WarrantyModal";
import { getWarranty, updateWarranty, deleteWarranty, warrantyAge, warrantiesQuery, WARRANTIES_QUERY_KEY } from "./api";

const NEXT_STATUS: Record<string, { to: string; label: string } | undefined> = {
  "In attesa": { to: "In lavorazione", label: "Start work" },
  "In lavorazione": { to: "Completato", label: "Mark as completed" },
};

export default function WarrantyDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const { data: warranty, isLoading, error } = useQuery({
    queryKey: [...WARRANTIES_QUERY_KEY, id],
    queryFn: () => getWarranty(id),
    // Usa a lista já carregada enquanto busca o registro atualizado.
    placeholderData: () =>
      (queryClient.getQueryData<Warranty[]>(warrantiesQuery.queryKey) ?? []).find((w) => w.id === id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: WARRANTIES_QUERY_KEY });
  const onError = (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertWarranty>) => updateWarranty(warranty!, data),
    onSuccess: () => {
      refresh();
      toast({ title: t("Saved"), description: t("Warranty updated") });
      setEditing(false);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWarranty(id),
    onSuccess: () => {
      refresh();
      toast({ title: t("Warranty deleted") });
      navigate("/warranties");
    },
    onError,
  });

  if (isLoading && !warranty) return <p className="py-16 text-center text-muted-foreground">{t("Loading warranties...")}</p>;
  if (error || !warranty) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to="/warranties">{t("All warranties")}</BackLink>
        <p className="py-16 text-center text-destructive">{t("Warranty not found")}</p>
      </div>
    );
  }

  const age = warrantyAge(warranty);
  const currentIndex = WARRANTY_STATUSES.indexOf(warranty.status as (typeof WARRANTY_STATUSES)[number]);
  const next = NEXT_STATUS[warranty.status];
  const dateFmt = (d: Date | null | undefined) => (d ? format(new Date(d), "dd/MM/yy", { locale }) : "—");

  const steps = WARRANTY_STATUSES.map((status, i) => ({
    key: status,
    label: t(WARRANTY_STATUS_LABELS[status]),
    pending: i > currentIndex,
    current: i === currentIndex,
    alert: i === currentIndex && age.stale,
    note:
      i === currentIndex
        ? status === "Completato"
          ? t("On {{date}}", { date: dateFmt(age.since) })
          : age.stale
            ? t("Stalled for {{count}} days", { count: age.days })
            : t("For {{count}} days", { count: age.days })
        : undefined,
  }));

  const images = warranty.images ?? [];

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/warranties">{t("All warranties")}</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="eyebrow">
            {warranty.protocolNumber} · {t("Opened on {{date}}", { date: dateFmt(warranty.startDate) })} · {t(PROCESS_TYPE_LABELS[warranty.processType] ?? warranty.processType)}
          </span>
          <h1 className="page-title break-words">{warranty.customerName}</h1>
          <span className="text-[15px] text-foreground/75">
            {[warranty.bikeModel, warranty.size && `${t("Size")} ${warranty.size}`, warranty.serialNumber].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" onClick={() => setEditing(true)}>{t("Edit")}</Button>
          {next && (
            <Button onClick={() => updateMutation.mutate({ status: next.to })} disabled={updateMutation.isPending}>
              {t(next.label)}
            </Button>
          )}
        </div>
      </header>

      <StageStepper steps={steps} />

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-5">
          <DetailCard title={t("Problem")}>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{warranty.problem}</p>
            {(warranty.paintDetails || warranty.componentsDescription || warranty.observation) && (
              <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-muted">
                {warranty.paintDetails && (
                  <div className="flex flex-col gap-1"><span className="eyebrow">{t("Paint details")}</span><span className="text-sm whitespace-pre-line">{warranty.paintDetails}</span></div>
                )}
                {warranty.componentsDescription && (
                  <div className="flex flex-col gap-1"><span className="eyebrow">{t("Mounted components")}</span><span className="text-sm whitespace-pre-line">{warranty.componentsDescription}</span></div>
                )}
                {warranty.observation && (
                  <div className="flex flex-col gap-1 sm:col-span-2"><span className="eyebrow">{t("Notes")}</span><span className="text-sm whitespace-pre-line">{warranty.observation}</span></div>
                )}
              </div>
            )}
          </DetailCard>

          <DetailCard
            title={`${t("Photos")} · ${images.length}`}
            action={<Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t("Add photos")}</Button>}
          >
            {images.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No photos uploaded")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {images.map((src, i) => (
                  <button key={src} type="button" onClick={() => setPhoto(src)} className="aspect-square rounded-md overflow-hidden bg-muted">
                    <img src={src} alt={t("Photo {{n}}", { n: i + 1 })} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </DetailCard>

          <DetailCard title={t("History")}>
            <TicketHistory history={warranty.history} createdLabel="Warranty created" compact />
          </DetailCard>
        </div>

        <div className="flex-[1_1_300px] flex flex-col gap-5 min-w-0">
          <DetailCard title={t("Process")}>
            <FactList
              facts={[
                { label: t("Customer"), value: warranty.customerName },
                { label: t("Email"), value: warranty.email && <a href={`mailto:${warranty.email}`} className="underline underline-offset-2">{warranty.email}</a> },
                { label: t("Agent"), value: warranty.agent },
                { label: t("Solution"), value: warranty.solution ? t(SOLUTION_LABELS[warranty.solution] ?? warranty.solution) : null },
                { label: t("Producer"), value: warranty.producer },
                ...(warranty.newSerialNumber ? [{ label: t("New serial number"), value: warranty.newSerialNumber }] : []),
              ]}
            />
          </DetailCard>
          <DetailCard title={t("Finance / administration")}>
            <FactList
              facts={[
                { label: t("Order no."), value: warranty.orderNumber },
                { label: t("Value"), value: warranty.value },
                { label: t("Invoice"), value: warranty.invoice },
              ]}
            />
          </DetailCard>
          <button
            type="button"
            onClick={() => window.confirm(t("Delete this warranty?")) && deleteMutation.mutate()}
            className="self-start inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-destructive hover:underline underline-offset-4"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("Delete warranty")}
          </button>
        </div>
      </div>

      <WarrantyModal
        open={editing}
        onClose={() => setEditing(false)}
        warranty={warranty}
        onSubmit={(data) => updateMutation.mutate(data)}
        isLoading={updateMutation.isPending}
      />

      <Dialog open={!!photo} onOpenChange={(open) => !open && setPhoto(null)}>
        <DialogContent className="max-w-5xl p-0 bg-transparent border-none shadow-none">
          <DialogHeader className="sr-only"><DialogTitle>{t("Photo gallery")}</DialogTitle></DialogHeader>
          <div className="relative flex items-center justify-center">
            {photo && <img src={photo} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain" />}
            <button type="button" onClick={() => setPhoto(null)} aria-label={t("Close")} className="absolute top-3 right-3 h-10 w-10 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

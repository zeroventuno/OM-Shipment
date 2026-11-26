import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { TICKET_PHASES, type Ticket, type InsertTicket } from "../schema";
import { PHASE_LABELS, APPROVAL_LABELS } from "../labels";
import { BackLink, DetailCard, FactList, StageStepper } from "../common/Detail";
import TicketHistory from "./TicketHistory";
import TicketModal from "./TicketModal";
import { getTicket, updateTicket, deleteTicket, ticketAge, ticketsQuery, TICKETS_QUERY_KEY } from "./api";

/*
 * Próximo passo de cada fase. Os que pedem dados (envio: transportadora e
 * rastreio; conclusão: aprovação) abrem o formulário já na fase nova.
 */
const NEXT_PHASE: Record<string, { to: InsertTicket["phase"]; label: string; needsForm: boolean } | undefined> = {
  "Ingresso": { to: "Spedito", label: "Register shipment", needsForm: true },
  "Spedito": { to: "In lavorazione", label: "Mark as in progress", needsForm: false },
  "In lavorazione": { to: "Completato", label: "Complete", needsForm: true },
};

export default function TicketDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Ticket | null>(null);

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: [...TICKETS_QUERY_KEY, id],
    queryFn: () => getTicket(id),
    placeholderData: () =>
      (queryClient.getQueryData<Ticket[]>(ticketsQuery.queryKey) ?? []).find((x) => x.id === id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY });
  const onError = (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertTicket>) => updateTicket(ticket!, data),
    onSuccess: () => {
      refresh();
      toast({ title: t("Saved"), description: t("Ticket updated") });
      setEditing(null);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTicket(id),
    onSuccess: () => {
      refresh();
      toast({ title: t("Ticket deleted") });
      navigate("/assistance");
    },
    onError,
  });

  if (isLoading && !ticket) return <p className="py-16 text-center text-muted-foreground">{t("Loading tickets...")}</p>;
  if (error || !ticket) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to="/assistance">{t("All tickets")}</BackLink>
        <p className="py-16 text-center text-destructive">{t("Ticket not found")}</p>
      </div>
    );
  }

  const age = ticketAge(ticket);
  const currentIndex = TICKET_PHASES.indexOf(ticket.phase as (typeof TICKET_PHASES)[number]);
  const next = NEXT_PHASE[ticket.phase];
  const dateFmt = (d: Date | null | undefined) => (d ? format(new Date(d), "dd/MM/yy", { locale }) : null);

  const steps = TICKET_PHASES.map((phase, i) => ({
    key: phase,
    label: t(PHASE_LABELS[phase]),
    pending: i > currentIndex,
    current: i === currentIndex,
    alert: i === currentIndex && age.stale,
    note:
      i === currentIndex
        ? phase === "Completato"
          ? t("On {{date}}", { date: dateFmt(ticket.completionDate ?? age.since) })
          : age.stale
            ? t("Stalled for {{count}} days", { count: age.days })
            : t("For {{count}} days", { count: age.days })
        : undefined,
  }));

  const goNext = () => {
    if (!next) return;
    if (next.needsForm) setEditing({ ...ticket, phase: next.to });
    else updateMutation.mutate({ phase: next.to });
  };

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/assistance">{t("All tickets")}</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="eyebrow">
            {ticket.code ?? `#${ticket.id.slice(0, 8)}`} · {t("Opened on {{date}}", { date: dateFmt(ticket.createdAt) })}
          </span>
          <h1 className="page-title break-words">{ticket.clientName}</h1>
          <span className="text-[15px] text-foreground/75">
            {[ticket.component, ticket.brand, ticket.serialNumber].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" asChild><Link to={`/entries/new?ticket=${ticket.id}`}>{t("ec.fromCase")}</Link></Button>
          <Button variant="outline" onClick={() => setEditing(ticket)}>{t("Edit")}</Button>
          {next && (
            <Button onClick={goNext} disabled={updateMutation.isPending}>{t(next.label)}</Button>
          )}
        </div>
      </header>

      <StageStepper steps={steps} />

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-5">
          <DetailCard title={t("Problem")}>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{ticket.problem || t("Not specified")}</p>
          </DetailCard>
          <DetailCard title={t("History")}>
            <TicketHistory history={ticket.history} compact />
          </DetailCard>
        </div>

        <div className="flex-[1_1_300px] flex flex-col gap-5 min-w-0">
          <DetailCard title={t("Ticket")}>
            <FactList
              facts={[
                { label: t("Customer"), value: ticket.clientName },
                { label: t("Email"), value: ticket.clientEmail && <a href={`mailto:${ticket.clientEmail}`} className="underline underline-offset-2">{ticket.clientEmail}</a> },
                { label: t("Agent"), value: ticket.agent },
                { label: t("Manufacturer protocol"), value: ticket.protocolNumber },
                { label: t("Approval"), value: ticket.approvalStatus ? t(APPROVAL_LABELS[ticket.approvalStatus] ?? ticket.approvalStatus) : null },
              ]}
            />
          </DetailCard>
          <DetailCard title={t("Shipping information")}>
            <FactList
              facts={[
                { label: t("Courier"), value: ticket.shippingCompany },
                { label: t("Tracking"), value: ticket.trackingNumber },
                { label: t("Shipping date"), value: dateFmt(ticket.shippingDate) },
                { label: t("Shipping cost"), value: ticket.shippingCost != null ? `€ ${Number(ticket.shippingCost).toFixed(2)}` : null },
                { label: t("Completion date"), value: dateFmt(ticket.completionDate) },
              ]}
            />
            {ticket.shipmentId && (
              <Link to={`/shipments/${ticket.shipmentId}`} className="tap-target self-start text-[11px] font-semibold uppercase tracking-[0.12em] underline-offset-4 hover:underline">
                {t("Open shipment")}
              </Link>
            )}
          </DetailCard>
          <button
            type="button"
            onClick={() => window.confirm(t("Delete this ticket?")) && deleteMutation.mutate()}
            className="tap-target self-start inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-destructive hover:underline underline-offset-4"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("Delete ticket")}
          </button>
        </div>
      </div>

      <TicketModal
        open={!!editing}
        onClose={() => setEditing(null)}
        ticket={editing}
        onSubmit={(data) => updateMutation.mutate(data)}
        isLoading={updateMutation.isPending}
      />
    </div>
  );
}

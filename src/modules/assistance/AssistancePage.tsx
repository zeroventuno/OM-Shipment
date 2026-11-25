import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TICKET_PHASES, type Ticket, type InsertTicket } from "../schema";
import { PHASE_LABELS, APPROVAL_LABELS } from "../labels";
import { PageHeader, SearchBox } from "../common/PageHeader";
import { StageBoard, AgeChip, Tag, ViewToggle, StaleBanner, useViewMode } from "../common/StageBoard";
import TicketTable from "./TicketTable";
import TicketModal from "./TicketModal";
import { ticketsQuery, TICKETS_QUERY_KEY, createTicket, deleteTicket, updateTicket, ticketAge } from "./api";
import { LIVE } from "@/lib/live";

export default function AssistancePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  // Ticket arrastado para "Enviado" ou "Concluído": abre o formulário já na fase nova.
  const [moving, setMoving] = useState<{ original: Ticket; draft: Ticket } | null>(null);
  const [search, setSearch] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [view, setView] = useViewMode("om-view-assistance");

  const { data: tickets = [], isLoading, error } = useQuery({ ...ticketsQuery, ...LIVE });

  const onError = (error: Error) =>
    toast({ title: t("Error"), description: error.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: (data: InsertTicket) => createTicket(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY });
      toast({ title: t("Saved"), description: t("Ticket created") });
      setModalOpen(false);
      navigate(`/assistance/${created.id}`);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY });
      toast({ title: t("Ticket deleted") });
    },
    onError,
  });

  const moveMutation = useMutation({
    mutationFn: ({ ticket, data }: { ticket: Ticket; data: Partial<InsertTicket> }) => updateTicket(ticket, data),
    onMutate: async ({ ticket, data }) => {
      await queryClient.cancelQueries({ queryKey: TICKETS_QUERY_KEY });
      const previous = queryClient.getQueryData<Ticket[]>(TICKETS_QUERY_KEY);
      queryClient.setQueryData<Ticket[]>(TICKETS_QUERY_KEY, (list = []) =>
        list.map((x) => (x.id === ticket.id && data.phase ? { ...x, phase: data.phase } : x))
      );
      return { previous };
    },
    onSuccess: (saved) => {
      toast({ title: t("Status changed"), description: `${saved.clientName} → ${t(PHASE_LABELS[saved.phase] ?? saved.phase)}` });
      setMoving(null);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(TICKETS_QUERY_KEY, context.previous);
      onError(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY }),
  });

  const handleMove = (ticket: Ticket, phase: string) => {
    const to = phase as InsertTicket["phase"];
    if (to === "Spedito" || to === "Completato") setMoving({ original: ticket, draft: { ...ticket, phase: to } });
    else moveMutation.mutate({ ticket, data: { phase: to } });
  };

  const withAge = useMemo(() => tickets.map((ticket) => ({ ticket, age: ticketAge(ticket) })), [tickets]);
  const stale = withAge.filter((x) => x.age.stale);

  const term = search.trim().toLowerCase();
  const filtered = withAge
    .filter((x) => !onlyStale || x.age.stale)
    .filter(({ ticket }) =>
      !term ||
      [ticket.code, ticket.clientName, ticket.component, ticket.brand, ticket.serialNumber, ticket.protocolNumber, ticket.trackingNumber]
        .some((value) => value?.toLowerCase().includes(term))
    );

  const columns = TICKET_PHASES.map((phase) => {
    const items = filtered.filter((x) => x.ticket.phase === phase);
    items.sort((a, b) => (phase === "Completato" ? b.age.since.getTime() - a.age.since.getTime() : b.age.days - a.age.days));
    return { key: phase, title: t(PHASE_LABELS[phase]), items };
  });

  const card = ({ ticket, age }: (typeof withAge)[number]) => (
    <Link
      to={`/assistance/${ticket.id}`}
      className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg hover:border-foreground transition-colors"
    >
      {ticket.code && <span className="-mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground tabular-nums">{ticket.code}</span>}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[17px] font-semibold tracking-tight leading-snug min-w-0 break-words">{ticket.clientName}</span>
        {ticket.phase === "Completato" ? (
          <AgeChip days={0} stale={false} label={format(age.since, "dd/MM")} />
        ) : (
          <AgeChip days={age.days} stale={age.stale} />
        )}
      </div>
      <span className="text-[13px] text-muted-foreground -mt-1.5">
        {[ticket.component, ticket.brand].filter(Boolean).join(" · ")}
      </span>
      {(ticket.protocolNumber || ticket.trackingNumber || ticket.approvalStatus) && (
        <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-muted">
          {ticket.approvalStatus && <Tag>{t(APPROVAL_LABELS[ticket.approvalStatus] ?? ticket.approvalStatus)}</Tag>}
          {ticket.protocolNumber && <Tag>{t("Manufacturer prot.")} {ticket.protocolNumber}</Tag>}
          {ticket.phase === "Spedito" && ticket.trackingNumber && (
            <Tag>{[ticket.shippingCompany, ticket.trackingNumber].filter(Boolean).join(" ")}</Tag>
          )}
        </div>
      )}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("{{count}} tickets", { count: tickets.length })}
        title={t("Assistance")}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <SearchBox value={search} onChange={setSearch} placeholder={t("Customer, component, protocol…")} />
            <Button onClick={() => setModalOpen(true)} data-testid="button-new-ticket">
              <Plus /> {t("New ticket")}
            </Button>
          </>
        }
      />

      <StaleBanner
        items={stale.map((x) => x.ticket.clientName)}
        active={onlyStale}
        onToggle={() => setOnlyStale((v) => !v)}
      />

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">{t("Loading tickets...")}</div>
      ) : error ? (
        <div className="py-16 text-center text-destructive">{t("Could not load tickets")}: {(error as Error).message}</div>
      ) : view === "board" ? (
        <StageBoard
          columns={columns}
          renderCard={card}
          getKey={(x) => x.ticket.id}
          collapse={{ Completato: 6 }}
          onMove={(x, phase) => handleMove(x.ticket, phase)}
        />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <TicketTable
            tickets={filtered.map((x) => x.ticket)}
            onEdit={(ticket: Ticket) => navigate(`/assistance/${ticket.id}`)}
            onDelete={(id) => {
              if (window.confirm(t("Delete this ticket?"))) deleteMutation.mutate(id);
            }}
          />
        </div>
      )}

      <TicketModal
        open={!!moving}
        onClose={() => setMoving(null)}
        ticket={moving?.draft ?? null}
        onSubmit={(data) => moving && moveMutation.mutate({ ticket: moving.original, data })}
        isLoading={moveMutation.isPending}
      />

      <TicketModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ticket={null}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}

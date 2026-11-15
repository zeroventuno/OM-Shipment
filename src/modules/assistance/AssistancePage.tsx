import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { type Ticket, type InsertTicket } from "../schema";
import PageHeader from "../PageHeader";
import DashboardMetrics from "./DashboardMetrics";
import TicketTable from "./TicketTable";
import TicketModal from "./TicketModal";
import { listTickets, createTicket, updateTicket, deleteTicket } from "./api";

const QUERY_KEY = ["tickets"];

export default function AssistancePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [search, setSearch] = useState("");

  const { data: tickets = [], isLoading, error } = useQuery({ queryKey: QUERY_KEY, queryFn: listTickets });

  const onError = (error: Error) =>
    toast({ title: t("Error"), description: error.message, variant: "destructive" });

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: (data: InsertTicket) => (editing ? updateTicket(editing, data) : createTicket(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: t("Saved"), description: editing ? t("Ticket updated") : t("Ticket created") });
      closeModal();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: t("Ticket deleted") });
    },
    onError,
  });

  const term = search.toLowerCase();
  const filtered = tickets.filter((ticket) =>
    [ticket.clientName, ticket.component, ticket.brand, ticket.serialNumber, ticket.protocolNumber]
      .some((value) => value?.toLowerCase().includes(term))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Assistance")}
        search={search}
        onSearch={setSearch}
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} data-testid="button-new-ticket">
            <Plus className="w-4 h-4 mr-2" />
            {t("New ticket")}
          </Button>
        }
      />

      <DashboardMetrics tickets={tickets} />

      <div className="border rounded-lg overflow-hidden bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">{t("Loading tickets...")}</div>
        ) : error ? (
          <div className="py-16 text-center text-destructive">{t("Could not load tickets")}: {(error as Error).message}</div>
        ) : (
          <TicketTable
            tickets={filtered}
            onEdit={(ticket) => { setEditing(ticket); setModalOpen(true); }}
            onDelete={(id) => {
              if (window.confirm(t("Delete this ticket?"))) deleteMutation.mutate(id);
            }}
          />
        )}
      </div>

      <TicketModal
        open={modalOpen}
        onClose={closeModal}
        ticket={editing}
        onSubmit={(data) => saveMutation.mutate(data)}
        isLoading={saveMutation.isPending}
      />
    </div>
  );
}

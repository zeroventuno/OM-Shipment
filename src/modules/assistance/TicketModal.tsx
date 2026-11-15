import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { type Ticket, type InsertTicket } from "../schema";
import TicketForm from "./TicketForm";

interface TicketModalProps {
  open: boolean;
  onClose: () => void;
  ticket?: Ticket | null;
  onSubmit: (data: InsertTicket) => void;
  isLoading?: boolean;
}

export default function TicketModal({ open, onClose, ticket, onSubmit, isLoading }: TicketModalProps) {
  const { t } = useTranslation();
  const defaultValues = ticket
    ? {
        clientName: ticket.clientName,
        clientEmail: ticket.clientEmail,
        component: ticket.component,
        brand: ticket.brand,
        serialNumber: ticket.serialNumber || "",
        problem: ticket.problem || "",
        protocolNumber: ticket.protocolNumber || "",
        approvalStatus: (ticket.approvalStatus || undefined) as InsertTicket["approvalStatus"],
        phase: ticket.phase as InsertTicket["phase"],
        shippingDate: ticket.shippingDate ? new Date(ticket.shippingDate).toISOString().split('T')[0] : "",
        trackingNumber: ticket.trackingNumber || "",
        shippingCompany: ticket.shippingCompany || "",
        completionDate: ticket.completionDate ? new Date(ticket.completionDate).toISOString().split('T')[0] : "",
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-ticket-modal">
        <DialogHeader>
          <DialogTitle>{ticket ? t("Edit ticket") : t("New ticket")}</DialogTitle>
        </DialogHeader>
        <TicketForm
          onSubmit={onSubmit}
          onCancel={onClose}
          defaultValues={defaultValues}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}

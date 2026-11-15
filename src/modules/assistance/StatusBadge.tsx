import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PHASE_LABELS } from "../labels";

const PHASE_STYLES: Record<string, string> = {
  "Ingresso": "bg-card text-foreground border-foreground",
  "Spedito": "bg-secondary text-foreground border-secondary",
  "In lavorazione": "bg-primary-variant text-white border-primary-variant",
  "Completato": "bg-primary text-primary-foreground border-primary",
};

export default function StatusBadge({ phase }: { phase: string }) {
  const { t } = useTranslation();
  if (!phase) return null;

  return (
    <Badge
      className={cn("border", PHASE_STYLES[phase] ?? "bg-muted text-muted-foreground")}
      data-testid={`badge-phase-${phase.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {PHASE_LABELS[phase] ? t(PHASE_LABELS[phase]) : phase}
    </Badge>
  );
}

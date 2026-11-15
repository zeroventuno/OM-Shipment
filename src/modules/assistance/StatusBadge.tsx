import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PHASE_LABELS } from "../labels";

const PHASE_STYLES: Record<string, string> = {
  "Ingresso": "bg-blue-100 text-blue-800 border-blue-200",
  "Spedito": "bg-purple-100 text-purple-800 border-purple-200",
  "In lavorazione": "bg-amber-100 text-amber-800 border-amber-200 animate-pulse",
  "Completato": "bg-muted text-muted-foreground border-muted",
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

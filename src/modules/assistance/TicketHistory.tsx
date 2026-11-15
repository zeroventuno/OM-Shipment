import { useTranslation } from "react-i18next";
import { type HistoryEntry } from "../schema";
import { VALUE_LABELS, fieldLabelKey } from "../labels";
import { useDateLocale } from "@/i18n/dateLocale";
import { format } from "date-fns";
import { Clock, Plus, Edit } from "lucide-react";

interface TicketHistoryProps {
  history: HistoryEntry[] | null;
  /** Chave de tradução do texto da entrada de criação. */
  createdLabel?: string;
}

export default function TicketHistory({ history, createdLabel = "Ticket created" }: TicketHistoryProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  if (!history || history.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        {t("No history available")}
      </div>
    );
  }

  const formatHistoryValue = (value: string): string => {
    if (value === "-") return t("Not specified");
    if (VALUE_LABELS[value]) return t(VALUE_LABELS[value]);
    
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime()) && value.includes("T")) {
        return format(date, "dd/MM/yyyy HH:mm", { locale });
      }
    } catch (e) {
      // Not a date
    }
    
    return value;
  };

  return (
    <div className="space-y-3 py-4">
      <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Clock className="w-4 h-4" />
        {t("Change history")}
      </h4>
      
      <div className="space-y-2">
        {history.map((entry, index) => (
          <div
            key={index}
            className="flex gap-3 text-sm border-l-2 border-border pl-3 py-2"
            data-testid={`history-entry-${index}`}
          >
            <div className="flex-shrink-0 pt-0.5">
              {entry.action === "created" ? (
                <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Edit className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium text-foreground">{t(fieldLabelKey(entry.field))}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(entry.date), "dd/MM/yyyy HH:mm", { locale })}
                </span>
              </div>
              
              {entry.action === "created" ? (
                <p className="text-muted-foreground mt-0.5">
                  {t(createdLabel)}
                </p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {entry.oldValue !== "-" && (
                    <div className="text-muted-foreground">
                      <span className="text-xs uppercase tracking-wide">{t("From")}:</span>{" "}
                      <span className="line-through">{formatHistoryValue(entry.oldValue)}</span>
                    </div>
                  )}
                  <div className="text-foreground">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("To")}:</span>{" "}
                    <span className="font-medium">{formatHistoryValue(entry.newValue)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

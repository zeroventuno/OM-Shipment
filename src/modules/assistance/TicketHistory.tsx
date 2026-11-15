import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { type HistoryEntry } from "../schema";
import { VALUE_LABELS, fieldLabelKey } from "../labels";
import { useDateLocale } from "@/i18n/dateLocale";

interface TicketHistoryProps {
  history: HistoryEntry[] | null;
  /** Chave de tradução do texto da entrada de criação. */
  createdLabel?: string;
  /** Sem o título (quando já está dentro de um bloco com título). */
  compact?: boolean;
}

/** Histórico de alterações, do mais recente para o mais antigo. */
export default function TicketHistory({ history, createdLabel = "Ticket created", compact = false }: TicketHistoryProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  if (!history || history.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">{t("No history available")}</p>;
  }

  const value = (raw: unknown): string => {
    const text = raw === null || raw === undefined ? "-" : String(raw);
    if (text === "-") return t("Not specified");
    if (VALUE_LABELS[text]) return t(VALUE_LABELS[text]);
    // Datas gravadas como ISO completo (com hora) aparecem formatadas.
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
      const d = new Date(text);
      if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy", { locale });
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return format(new Date(`${text}T00:00:00`), "dd/MM/yyyy", { locale });
    return text;
  };

  const entries = [...history].reverse();

  return (
    <div className="flex flex-col gap-3">
      {!compact && <h4 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Change history")}</h4>}
      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <li key={index} className="grid grid-cols-[92px_1fr] gap-4 text-sm" data-testid={`history-entry-${index}`}>
            <time className="text-muted-foreground tabular-nums" dateTime={entry.date}>
              {format(new Date(entry.date), "dd/MM HH:mm", { locale })}
            </time>
            {entry.action === "created" ? (
              <span className="font-semibold">{t(createdLabel)}</span>
            ) : fieldLabelKey(entry.field) === "Photos" ? (
              <span className="font-semibold">{t("Photos updated")}</span>
            ) : (
              <span className="min-w-0 break-words">
                <span className="font-semibold">{t(fieldLabelKey(entry.field))}</span>{" "}
                {entry.oldValue !== "-" && entry.oldValue !== null && (
                  <><span className="text-muted-foreground line-through">{value(entry.oldValue)}</span> → </>
                )}
                {value(entry.newValue)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

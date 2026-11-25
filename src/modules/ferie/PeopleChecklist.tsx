import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee } from "./logic";

/*
 * "Chi partecipa": lista com caixas de marcar, busca e contagem. Quem está
 * marcado vai ao evento (reunião, trasferta, reunião externa) e conta como
 * fora nos conflitos. `locked` = pessoa que não pode ser desmarcada (no link
 * pessoal, quem está criando).
 */
export function PeopleChecklist({ employees, value, onChange, locked, sectorName }: {
  employees: Employee[];
  value: string[];
  onChange: (ids: string[]) => void;
  locked?: string;
  sectorName?: (id: string | null | undefined) => string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = employees.filter((e) => !q.trim() || norm(e.name).includes(norm(q.trim())));
  const toggle = (id: string) => {
    if (id === locked) return;
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  const picked = employees.filter((e) => value.includes(e.id));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="eyebrow mb-1">{t("fe.who")}</legend>
      <p className="text-xs text-muted-foreground">{t("fe.whoHint")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fe.whoSearch")} aria-label={t("fe.whoSearch")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <span className="text-xs font-semibold tabular-nums">{t("fe.whoCount", { count: picked.length })}</span>
      </div>
      <ul className="max-h-64 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border">
        {shown.map((e) => {
          const on = value.includes(e.id);
          return (
            <li key={e.id}>
              <button type="button" role="checkbox" aria-checked={on} disabled={e.id === locked} onClick={() => toggle(e.id)}
                className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary/60", on && "bg-secondary/50")}>
                <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  on ? "border-foreground bg-foreground text-background" : "border-foreground/40")}>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{e.name}{e.id === locked && ` (${t("fe.you")})`}</span>
                {sectorName && <span className="shrink-0 text-xs text-muted-foreground">{sectorName(e.primary_sector)}</span>}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t("Nothing here")}</li>}
      </ul>
      {picked.length > 0 && <p className="text-xs text-muted-foreground">{picked.map((e) => e.name).join(", ")}</p>}
    </fieldset>
  );
}

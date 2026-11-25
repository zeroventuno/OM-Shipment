import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDays, sectorNamer, todayRome, type DayPart, type LeaveStatus, type SectorInfo } from "./logic";

/* Peças usadas pela página do escritório e pelo link pessoal. */

/** Setores do banco, para nomes e listas em qualquer tela de Ferie. */
const SectorsContext = createContext<SectorInfo[]>([]);
export const SectorsProvider = SectorsContext.Provider;
export const useSectors = () => useContext(SectorsContext);
export const useSectorName = () => sectorNamer(useContext(SectorsContext));

/** Janela do mapa: começa uma semana antes de hoje; as setas andam 4 semanas. */
export function useMonthWindow(months = 2) {
  const today = todayRome();
  const start = addDays(today, -7);
  const [first, setFirst] = useState(start);
  return {
    first, days: months * 31, today,
    move: (n: number) => setFirst((f) => addDays(f, n * 28)),
    reset: () => setFirst(start),
  };
}

export function MonthNav({ win }: { win: ReturnType<typeof useMonthWindow> }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label={t("fe.prev")} onClick={() => win.move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
      <Button variant="outline" onClick={win.reset}>{t("fe.today")}</Button>
      <Button variant="outline" size="icon" aria-label={t("fe.next")} onClick={() => win.move(1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}

export function StatusChip({ status }: { status: LeaveStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
      status === "approved" ? "bg-italy-green/15 text-italy-green" : status === "pending" ? "bg-secondary"
        : status === "proposed" ? "bg-foreground text-background" : "bg-destructive/10 text-destructive")}
      style={status === "approved" ? { backgroundColor: "hsl(var(--italy-green) / .12)", color: "hsl(var(--italy-green))" } : undefined}>
      {t(`fe.status.${status}`)}
    </span>
  );
}

export function PartPicker({ value, singleDay, onChange }: { value: DayPart; singleDay: boolean; onChange: (p: DayPart) => void }) {
  const { t } = useTranslation();
  const parts: DayPart[] = singleDay ? ["full", "am", "pm"] : ["full"];
  return (
    <div role="radiogroup" aria-label={t("fe.partLabel")} className="flex flex-wrap gap-2">
      {parts.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)}
          className={cn("h-10 rounded-full border px-4 text-sm", value === p ? "border-foreground bg-secondary font-semibold" : "border-border bg-card")}>
          {t(`fe.part.${p}`)}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{title}</h2>
      {children}
    </section>
  );
}

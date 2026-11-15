import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 self-start text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/75 hover:text-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Bloco branco com título em caixa alta, usado nas páginas de detalhe. */
export function DetailCard({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Lista "rótulo — valor" em linhas. Valores vazios aparecem como "—". */
export function FactList({ facts }: { facts: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col">
      {facts.map((f) => (
        <div key={f.label} className="flex justify-between gap-4 py-2.5 border-b border-muted last:border-0 text-sm">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className="font-semibold text-right break-words min-w-0">{f.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface Step {
  key: string;
  label: string;
  note?: ReactNode;
  /** A etapa ainda não foi alcançada. */
  pending?: boolean;
  current?: boolean;
  alert?: boolean;
}

/** Barra de etapas do processo. */
export function StageStepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => (
        <li key={s.key} aria-current={s.current ? "step" : undefined} className="flex flex-col gap-2 min-w-0">
          <div className={cn("h-1 rounded-full", s.pending ? "bg-border" : "bg-foreground")} />
          <span className={cn("text-[11px] font-bold uppercase tracking-[0.1em] truncate", s.pending && "text-muted-foreground")}>
            {i + 1} · {s.label}
          </span>
          {s.note && (
            <span className={cn("text-xs", s.alert ? "text-destructive font-semibold" : "text-muted-foreground")}>{s.note}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

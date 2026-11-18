import { useState, type ReactNode } from "react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface BoardColumn<T> {
  key: string;
  title: string;
  items: T[];
}

interface StageBoardProps<T> {
  columns: BoardColumn<T>[];
  renderCard: (item: T) => ReactNode;
  getKey: (item: T) => string;
  /** Colunas que mostram só os N primeiros (ex.: concluídos), com "mostrar todos". */
  collapse?: Record<string, number>;
  /**
   * Chamado quando um cartão é arrastado para outra coluna (só no computador).
   * Sem ele, os cartões não são arrastáveis.
   */
  onMove?: (item: T, toColumn: string) => void;
}

const DRAG_TYPE = "application/x-om-card";

/**
 * Quadro com uma coluna por etapa. No computador as colunas ficam lado a
 * lado; no celular viram abas, uma etapa por vez.
 */
export function StageBoard<T>({ columns, renderCard, getKey, collapse = {}, onMove }: StageBoardProps<T>) {
  const { t } = useTranslation();
  const [mobileColumn, setMobileColumn] = useState(columns[0]?.key);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Arrastar: de qual coluna saiu o cartão e sobre qual coluna ele está.
  const [dragging, setDragging] = useState<{ key: string; from: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const findItem = (key: string) => {
    for (const col of columns) {
      const item = col.items.find((i) => getKey(i) === key);
      if (item) return { item, from: col.key };
    }
    return null;
  };

  const dropProps = (colKey: string) =>
    onMove
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!dragging || dragging.from === colKey) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== colKey) setOver(colKey);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === colKey ? null : o));
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const key = e.dataTransfer.getData(DRAG_TYPE) || dragging?.key;
            setOver(null);
            setDragging(null);
            const found = key ? findItem(key) : null;
            if (found && found.from !== colKey) onMove(found.item, colKey);
          },
        }
      : {};

  const dragProps = (item: T, colKey: string, mobile: boolean) =>
    onMove && !mobile
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData(DRAG_TYPE, getKey(item));
            e.dataTransfer.effectAllowed = "move";
            setDragging({ key: getKey(item), from: colKey });
          },
          onDragEnd: () => {
            setDragging(null);
            setOver(null);
          },
        }
      : {};

  const renderColumn = (col: BoardColumn<T>, mobile: boolean) => {
    const limit = collapse[col.key];
    const visible = limit && !expanded[col.key] ? col.items.slice(0, limit) : col.items;
    const hidden = col.items.length - visible.length;
    return (
      <section
        key={col.key}
        aria-label={col.title}
        className={cn(
          "flex flex-col gap-2.5 min-w-0 rounded-lg transition-colors",
          !mobile && "min-h-40 p-1 -m-1",
          over === col.key && "bg-secondary outline-dashed outline-2 outline-foreground/40"
        )}
        {...(mobile ? {} : dropProps(col.key))}
      >
        {!mobile && (
          <div className="flex items-center justify-between px-1 pb-1.5 border-b-2 border-foreground">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{col.title}</h2>
            <span className="text-2xl font-bold tracking-tight">{col.items.length}</span>
          </div>
        )}
        {visible.map((item) => (
          <div
            key={getKey(item)}
            className={cn(onMove && !mobile && "cursor-grab active:cursor-grabbing", dragging?.key === getKey(item) && "opacity-40")}
            {...dragProps(item, col.key, mobile)}
          >
            {renderCard(item)}
          </div>
        ))}
        {col.items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("Nothing here")}</p>
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => ({ ...e, [col.key]: true }))}
            className="py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            {t("Show {{count}} more", { count: hidden })}
          </button>
        )}
      </section>
    );
  };

  const current = columns.find((c) => c.key === mobileColumn) ?? columns[0];

  return (
    <>
      {/* Celular: abas por etapa */}
      <div className="md:hidden flex flex-col gap-4">
        <div role="tablist" className="no-scrollbar flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
          {columns.map((col) => (
            <button
              key={col.key}
              type="button"
              role="tab"
              aria-selected={col.key === current?.key}
              onClick={() => setMobileColumn(col.key)}
              className={cn(
                "shrink-0 h-9 px-4 rounded-full border text-[11px] font-semibold uppercase tracking-[0.08em]",
                col.key === current?.key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"
              )}
            >
              {col.title} · {col.items.length}
            </button>
          ))}
        </div>
        {current && renderColumn(current, true)}
      </div>

      {/* Computador: colunas lado a lado */}
      {onMove && (
        <p className="hidden md:block -mt-2 text-xs text-muted-foreground">{t("Drag a card to another column to change its status")}</p>
      )}
      <div className="hidden md:block overflow-x-auto pb-2">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))`, minWidth: columns.length * 270 }}
        >
          {columns.map((col) => renderColumn(col, false))}
        </div>
      </div>
    </>
  );
}

/** Indicador de dias na etapa: cinza normalmente, vermelho quando atrasado. */
export function AgeChip({ days, stale, label }: { days: number; stale: boolean; label?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap",
        stale ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground/75"
      )}
      title={stale ? t("Stalled for more than 30 days") : undefined}
    >
      {label ?? t("{{count}} d", { count: days })}
    </span>
  );
}

/** Etiqueta em pílula com contorno, usada nos cartões. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-full border border-border text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/80">
      {children}
    </span>
  );
}

/** Alterna entre quadro e lista, lembrando a escolha por página. */
export function useViewMode(storageKey: string): ["board" | "list", (v: "board" | "list") => void] {
  const [mode, setMode] = useState<"board" | "list">(() => {
    try {
      return localStorage.getItem(storageKey) === "list" ? "list" : "board";
    } catch {
      return "board";
    }
  });
  const set = (v: "board" | "list") => {
    setMode(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {
      // ignora
    }
  };
  return [mode, set];
}

export function ViewToggle({ value, onChange }: { value: "board" | "list"; onChange: (v: "board" | "list") => void }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("View")} className="hidden md:flex p-1 rounded-full bg-secondary">
      {(["board", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-9 px-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em]",
            value === v ? "bg-card text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"
          )}
        >
          {v === "board" ? t("Board") : t("List")}
        </button>
      ))}
    </div>
  );
}

/** Aviso de processos parados, com atalho para filtrar só esses. */
export function StaleBanner({ items, active, onToggle }: { items: string[]; active: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-lg bg-card border border-border">
      <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
      <span className="text-sm font-semibold">{t("{{count}} stalled for more than 30 days", { count: items.length })}</span>
      <span className="text-sm text-muted-foreground truncate max-w-full">{items.slice(0, 4).join(", ")}{items.length > 4 ? "…" : ""}</span>
      <button
        type="button"
        onClick={onToggle}
        className="ml-auto text-[11px] font-semibold uppercase tracking-[0.12em] underline-offset-4 hover:underline"
      >
        {active ? t("Show all") : t("Show only these")}
      </button>
    </div>
  );
}

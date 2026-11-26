import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MARK_KINDS, MARK_SIDES, MAX_MARKS, NOTE_MAX,
  clampPercent, nearbyMark, newMark, removeMark, upsertMark,
  type Mark, type MarkKind, type MarkSide,
} from "./marks";

export const BIKE_DIAGRAM = "/bike-diagram.png";

/** quanto o dedo precisa andar para ser arrasto, e não toque */
const DRAG_START = 1.5;

/**
 * O desenho da bike com os defeitos marcados (o mesmo do Rentaloop): toca no
 * desenho e nasce uma marca numerada, que se classifica, se arrasta e se apaga.
 */
export function BikeMarks({ marks, onChange }: { marks: Mark[]; onChange?: (marks: Mark[]) => void }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // o próximo toque repete a última escolha: numa bike arranhada, são todos graffi
  const [kind, setKind] = useState<MarkKind>("graffio");
  const [side, setSide] = useState<MarkSide>("d");

  const readOnly = !onChange;
  const full = marks.length >= MAX_MARKS;
  const current = marks.find((m) => m.id === selected) ?? null;

  function at(e: { clientX: number; clientY: number }) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { x: 0, y: 0 };
    return { x: clampPercent(((e.clientX - r.left) / r.width) * 100), y: clampPercent(((e.clientY - r.top) / r.height) * 100) };
  }

  function addAt(e: React.PointerEvent) {
    if (!onChange) return;
    const { x, y } = at(e);
    const hit = nearbyMark(marks, x, y);
    if (hit) return setSelected(hit.id);
    if (full) return;
    const mark = newMark(x, y, kind, side);
    onChange([...marks, mark]);
    setSelected(mark.id);
  }

  function startDrag(e: React.PointerEvent, mark: Mark) {
    if (!onChange) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = at(e);
    drag.current = { id: mark.id, x, y, moved: false };
    setSelected(mark.id);
  }

  function moveDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !onChange) return;
    const { x, y } = at(e);
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < DRAG_START) return;
    d.moved = true;
    const mark = marks.find((m) => m.id === d.id);
    if (mark) onChange(upsertMark(marks, { ...mark, x, y }));
  }

  function change(patch: Partial<Mark>) {
    if (!onChange || !current) return;
    onChange(upsertMark(marks, { ...current, ...patch }));
  }

  const pill = (on: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      on ? "border-destructive bg-destructive/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="eyebrow">{t("ec.marks")}</span>
        {!readOnly && <span className="text-xs text-muted-foreground">{full ? t("ec.marks.full", { n: MAX_MARKS }) : t("ec.marks.hint")}</span>}
      </div>

      <div
        ref={box}
        onPointerDown={readOnly ? undefined : addAt}
        className={cn("relative aspect-[3/2] w-full select-none rounded-xl border border-border bg-white", !readOnly && "cursor-crosshair")}
      >
        <img src={BIKE_DIAGRAM} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain p-2" />
        {marks.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onPointerDown={(e) => startDrag(e, m)}
            onPointerMove={moveDrag}
            onPointerUp={() => { drag.current = null; }}
            onClick={(e) => { e.stopPropagation(); setSelected(m.id); }}
            aria-label={`${i + 1} · ${t(`ec.kind.${m.kind}`)} · ${t(`ec.side.${m.side}`)}${m.note ? ` · ${m.note}` : ""}`}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            className={cn(
              "absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white transition-all",
              m.id === selected ? "bg-destructive ring-4 ring-destructive/25" : "bg-destructive/85 hover:scale-110",
              readOnly ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing",
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {current && !readOnly && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {MARK_KINDS.map((k) => (
              <button key={k} type="button" className={pill(current.kind === k)} onClick={() => { setKind(k); change({ kind: k }); }}>
                {t(`ec.kind.${k}`)}
              </button>
            ))}
            <span className="mx-1 w-px self-stretch bg-border" />
            {MARK_SIDES.map((sd) => (
              <button key={sd} type="button" className={pill(current.side === sd)} onClick={() => { setSide(sd); change({ side: sd }); }}>
                {t(`ec.side.${sd}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={current.note}
              onChange={(e) => change({ note: e.target.value.slice(0, NOTE_MAX) })}
              maxLength={NOTE_MAX}
              placeholder={t("ec.marks.note")}
              className="h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={() => { onChange?.(removeMark(marks, current.id)); setSelected(null); }}
              aria-label={t("ec.marks.remove")}
              title={t("ec.marks.remove")}
              className="rounded-lg border border-border p-2.5 text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {marks.length > 0 && (
        <ol className="space-y-1 text-sm text-muted-foreground">
          {marks.map((m, i) => (
            <li key={m.id}>
              <button type="button" onClick={() => setSelected(m.id)} className={cn("text-left hover:text-foreground", m.id === selected && "font-semibold text-foreground")}>
                <span className="tabular-nums">{i + 1}.</span> {t(`ec.kind.${m.kind}`)} · {t(`ec.side.${m.side}`)}{m.note ? ` · ${m.note}` : ""}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

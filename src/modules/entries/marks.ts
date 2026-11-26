/**
 * Marcas de defeito sobre o desenho da bike (Controllo di entrata), como no
 * Rentaloop: cada marca é um ponto no desenho, com x e y em porcentagem (vale
 * em qualquer tela e na impressão), o tipo do defeito, o lado e uma nota curta.
 *
 * O que vem do banco é jsonb: tudo passa por parseMarks, que descarta o que
 * não serve em vez de quebrar a tela.
 */

export const MARK_KINDS = ["graffio", "ammaccatura", "rotto", "mancante", "usura"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** o desenho é de perfil: d é o lato trasmissione, s o outro */
export const MARK_SIDES = ["d", "s"] as const;
export type MarkSide = (typeof MARK_SIDES)[number];

export type Mark = { id: string; x: number; y: number; kind: MarkKind; side: MarkSide; note: string };

export const MAX_MARKS = 20;
export const NOTE_MAX = 120;
/** duas marcas a menos disso, em pontos percentuais, são o mesmo lugar */
export const SAME_SPOT = 5;

const isKind = (v: unknown): v is MarkKind => (MARK_KINDS as readonly string[]).includes(v as string);
const isSide = (v: unknown): v is MarkSide => (MARK_SIDES as readonly string[]).includes(v as string);

export function clampPercent(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

const cleanNote = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "");

let seq = 0;
export function markId(): string {
  seq = (seq + 1) % 1000;
  return `${Date.now().toString(36)}${seq.toString(36)}`;
}

export function newMark(x: number, y: number, kind: MarkKind = "graffio", side: MarkSide = "d"): Mark {
  return { id: markId(), x: clampPercent(x), y: clampPercent(y), kind, side, note: "" };
}

export function parseMarks(raw: unknown): Mark[] {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  const out: Mark[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (r.x == null || r.y == null) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 24) : markId(),
      x: clampPercent(r.x),
      y: clampPercent(r.y),
      kind: isKind(r.kind) ? r.kind : "graffio",
      side: isSide(r.side) ? r.side : "d",
      note: cleanNote(r.note),
    });
    if (out.length === MAX_MARKS) break;
  }
  return out;
}

/** a marca já existente naquele ponto, para não marcar duas vezes */
export function nearbyMark(marks: Mark[], x: number, y: number, tolerance = SAME_SPOT): Mark | null {
  let best: Mark | null = null;
  let bestDistance = Infinity;
  for (const m of marks) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= tolerance && d < bestDistance) { best = m; bestDistance = d; }
  }
  return best;
}

export const upsertMark = (marks: Mark[], mark: Mark) =>
  marks.some((m) => m.id === mark.id) ? marks.map((m) => (m.id === mark.id ? mark : m)) : [...marks, mark];

export const removeMark = (marks: Mark[], id: string) => marks.filter((m) => m.id !== id);

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * I pezzi del report annuale: SVG e HTML semplici, senza librerie di
 * grafici, così la carta stampa esattamente ciò che si vede. Tutto in
 * nero e grafite; il rosso italiano solo per i segnali da tenere d'occhio.
 */

export const INK = "#0A0A0A";
export const GRAPHITE = "#292D30";
export const RED = "#CD212A";
const GRID = "rgba(0,0,0,0.09)";
const LABEL = "rgba(0,0,0,0.55)";

/** i colori delle fette, dal più scuro al più chiaro */
/*
 * Cores dos gráficos (paleta validada para daltonismo, ordem fixa):
 * azul = a série do ano; laranja tracejado = o ano anterior; as divisões usam
 * as cores na ordem abaixo, e "Altri"/"Non indicato" ficam em cinza.
 * O vermelho (RED) é reservado aos pontos de atenção — nunca é uma série.
 */
export const BLUE = "#2a78d6";
export const ORANGE = "#eb6834";
export const GOOD = "#1f7a3d";
const OTHER = "#B4B8BC";
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
const isOther = (label: string) => /^(altri|altro|altre|outros|outro|outras|non |não |nao |sem |senza |—|-$)/i.test(label.trim());
/** cor de cada fatia: ordem fixa, pulando as "outras" (cinza) */
const sliceColors = (labels: string[]) => {
  let k = 0;
  return labels.map((l) => (isOther(l) ? OTHER : SERIES[Math.min(k++, SERIES.length - 1)]));
};

export const eyebrow = "text-[9.5px] font-bold uppercase tracking-[0.16em] text-black/50";

/** il massimo arrotondato della scala: 1, 2, 2,5 o 5 volte una potenza di 10 */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** una pagina del report: sulla carta comincia su un foglio nuovo */
export function Page({ children, first = false, running }: { children: ReactNode; first?: boolean; running?: ReactNode }) {
  return (
    <section className={cn("rep-page relative border-b border-black/10 py-10 last:border-b-0 print:border-b-0 print:py-0", !first && "break-before-page")}>
      {running && <p className="mb-6 flex justify-between gap-4 border-b border-black/10 pb-2 text-[9.5px] uppercase tracking-[0.14em] text-black/45">{running}</p>}
      {children}
    </section>
  );
}

export function SectionTitle({ n, title, intro }: { n: number; title: string; intro?: string }) {
  return (
    <header className="mb-6">
      <p className="text-[13px] font-extrabold tabular-nums text-black/45">{String(n).padStart(2, "0")}</p>
      <h2 className="mt-1 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]">{title}</h2>
      {intro && <p className="mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-black/70">{intro}</p>}
    </header>
  );
}

export function SubTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-4 border-b border-black/15 pb-1.5">
      <h3 className="text-[13px] font-bold">{children}</h3>
      {aside && <span className="text-right text-[10.5px] text-black/50">{aside}</span>}
    </div>
  );
}

/** delta: good = la variazione va nella direzione buona (nero), altrimenti rosso */
export type Delta = { text: string; up: boolean; good: boolean };

export function Kpi({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: Delta | null }) {
  return (
    <div className="min-w-0 border-t-2 pt-2.5" style={{ borderColor: INK }}>
      <p className={eyebrow}>{label}</p>
      <p className="mt-1.5 break-words text-[22px] font-extrabold leading-none tracking-[-0.02em] tabular-nums sm:text-[24px]">{value}</p>
      {delta && (
        <p className="mt-1.5 text-[10.5px] font-semibold tabular-nums" style={{ color: delta.good ? GOOD : RED }}>
          {delta.up ? "▲" : "▼"} {delta.text}
        </p>
      )}
      {sub && <p className="mt-1 text-[10.5px] leading-snug text-black/55">{sub}</p>}
    </div>
  );
}

/** la lettura del blocco: le conclusioni che valgono per questa sezione */
export function Reading({ title, items }: { title: string; items: { text: string; watch: boolean }[] }) {
  if (items.length === 0) return null;
  return (
    <aside className="mt-6 break-inside-avoid rounded-md bg-black/[0.035] px-5 py-4">
      <p className={eyebrow}>{title}</p>
      <ul className="mt-2 grid gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: it.watch ? RED : INK }} />
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** barre per mese; marker: il valore dell'anno precedente, come trattino sopra la barra */
export function MonthBars({ labels, values, marker, fmt, fmtAxis }: {
  labels: string[];
  values: number[];
  marker?: number[] | null;
  fmt: (n: number) => string;
  fmtAxis: (n: number) => string;
}) {
  const W = 680;
  const H = 230;
  const L = 46;
  const B = 22;
  const T = 18;
  const plotW = W - L - 6;
  const plotH = H - B - T;
  const max = niceMax(Math.max(0, ...values, ...(marker ?? [0])));
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const band = plotW / labels.length;
  const bw = band * 0.56;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={v === 0 ? 1.2 : 0.8} />
          <text x={L - 7} y={y(v) + 3} textAnchor="end" fontSize="9" fill={LABEL}>{fmtAxis(v)}</text>
        </g>
      ))}
      {labels.map((m, i) => {
        const x = L + band * i + (band - bw) / 2;
        const v = values[i] ?? 0;
        return (
          <g key={m}>
            {v > 0 && <rect x={x} y={y(v)} width={bw} height={Math.max(0.5, y(0) - y(v))} fill={BLUE} rx={1.5} />}
            {v > 0 && <text x={x + bw / 2} y={y(v) - 4} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={INK}>{fmt(v)}</text>}
            {marker && (marker[i] ?? 0) > 0 && (
              <line x1={x - 3} x2={x + bw + 3} y1={y(marker[i])} y2={y(marker[i])} stroke={ORANGE} strokeWidth="2" strokeDasharray="3 2" />
            )}
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill={LABEL}>{m}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** il cumulato dell'anno, mese per mese, contro quello dell'anno precedente */
export function Cumulative({ labels, now, prev, fmtAxis, nowLabel, prevLabel, lastMonth }: {
  labels: string[];
  now: number[];
  prev: number[];
  fmtAxis: (n: number) => string;
  nowLabel: string;
  prevLabel: string;
  /** l'ultimo mese da disegnare per l'anno in corso (0-11) */
  lastMonth: number;
}) {
  const W = 680;
  const H = 200;
  const L = 46;
  const B = 22;
  const T = 14;
  const plotW = W - L - 16;
  const plotH = H - B - T;
  const cum = (a: number[]) => a.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);
  const cNow = cum(now);
  const cPrev = cum(prev);
  const max = niceMax(Math.max(0, ...cNow.slice(0, lastMonth + 1), ...cPrev));
  const x = (i: number) => L + (plotW / (labels.length - 1)) * i;
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const path = (c: number[], upTo: number) => c.slice(0, upTo + 1).map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 16} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={v === 0 ? 1.2 : 0.8} />
            <text x={L - 7} y={y(v) + 3} textAnchor="end" fontSize="9" fill={LABEL}>{fmtAxis(v)}</text>
          </g>
        ))}
        {labels.map((m, i) => <text key={m} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill={LABEL}>{m}</text>)}
        <path d={path(cPrev, 11)} fill="none" stroke={ORANGE} strokeWidth="2" strokeDasharray="4 3" />
        {lastMonth >= 0 && <path d={path(cNow, lastMonth)} fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinejoin="round" />}
        {lastMonth >= 0 && <circle cx={x(lastMonth)} cy={y(cNow[lastMonth])} r="4" fill={BLUE} stroke="#fff" strokeWidth="2" />}
      </svg>
      <Legend items={[{ label: nowLabel, color: BLUE }, { label: prevLabel, color: ORANGE, dashed: true }]} />
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10.5px] text-black/65">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.dashed ? (
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: it.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** come si divide un totale, in una barra sola con legenda e valori */
export function ShareBar({ parts, cols = 2 }: { parts: { label: string; value: number; detail: string }[]; cols?: 1 | 2 }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  const colors = sliceColors(parts.map((p) => p.label));
  return (
    <div className="break-inside-avoid">
      <div className="flex h-5 w-full gap-[2px] overflow-hidden">
        {parts.map((p, i) => (p.value > 0 ? <div key={p.label} className="first:rounded-l-sm last:rounded-r-sm" style={{ width: `${(p.value / total) * 100}%`, background: colors[i] }} /> : null))}
      </div>
      <div className={cn("mt-3 grid gap-x-6 gap-y-2", cols === 2 && "sm:grid-cols-2 print:grid-cols-2")}>
        {parts.map((p, i) => (
          <div key={p.label} className="flex min-w-0 items-baseline gap-2 text-[11.5px]">
            <span className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] border border-black/10" style={{ background: colors[i] }} />
            <span className="truncate font-semibold">{p.label}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums text-black/65">{p.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** una classifica in barre orizzontali: etichetta, barra e valore */
export function HBars({ rows }: { rows: { label: string; value: number; text: string; sub?: string }[] }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div className="grid gap-1.5">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="grid break-inside-avoid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-[11.5px] sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_auto] print:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_auto]">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-3 rounded-sm bg-black/[0.05]">
            <span className="block h-3 rounded-sm" style={{ width: `${max > 0 ? Math.max(1.5, (r.value / max) * 100) : 0}%`, background: isOther(r.label) ? OTHER : BLUE }} />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums">
            <span className="font-semibold">{r.text}</span>
            {r.sub && <span className="ml-1.5 text-black/50">{r.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** tabella del report: la prima colonna è testo, le altre numeri */
export function Table({ head, rows, foot }: { head: string[]; rows: (string | number)[][]; foot?: (string | number)[] }) {
  const cell = (v: string | number, j: number, strong = false) => (
    <td key={j} className={cn("py-1.5", j === 0 ? "pr-3 text-left" : "whitespace-nowrap pl-3 text-right tabular-nums", strong && "font-bold")}>{v}</td>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-black/25">
            {head.map((h, j) => (
              <th key={h} className={cn("pb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-black/50", j === 0 ? "pr-3 text-left" : "whitespace-nowrap pl-3 text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid border-b border-black/[0.07]">{r.map((v, j) => cell(v, j))}</tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-black/60">{foot.map((v, j) => cell(v, j, true))}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** un numero grande con la sua spiegazione (qualità dei dati) */
export function CountRow({ n, title, hint, watch }: { n: string; title: string; hint: string; watch?: boolean }) {
  return (
    <div className="grid break-inside-avoid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 border-b border-black/[0.07] pb-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <p className="text-[26px] font-extrabold leading-none tabular-nums" style={{ color: watch ? RED : INK }}>{n}</p>
      <div>
        <p className="text-[12px] font-bold">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-black/65">{hint}</p>
      </div>
    </div>
  );
}

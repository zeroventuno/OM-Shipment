import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSectorName, useSectors } from "./parts";
import {
  absences, addDays, orderedSectors, dayRange, daysBetween, isActive, isWeekend, sectorConflictDays, vanClashes,
  type AgendaEvent, type Employee, type Leave, type Sector,
} from "./logic";

/*
 * Mapa das férias, no jeito do mapa de aluguéis do Rentaloop: dias na
 * horizontal, nomes fixos à esquerda, uma linha por pessoa agrupada pelo setor
 * principal. Quem tem o setor como secundário aparece embaixo, mais apagado.
 * Os dias úteis em que duas pessoas do setor estão fora ficam em vermelho na
 * linha do setor.
 */

const DAY_W = 26;
const grid = `repeating-linear-gradient(to right, hsl(var(--border)) 0 1px, transparent 1px ${DAY_W}px)`;

export interface MapVan { id: string; name: string; plate?: string | null }

interface Props {
  from: string;
  days: number;
  employees: Employee[];
  leaves: Leave[];
  events: AgendaEvent[];
  vans?: MapVan[];
  meId?: string;
  today: string;
  onLeave?: (leave: Leave) => void;
  onEvent?: (event: AgendaEvent) => void;
}

type Bar = { key: string; start: string; end: string; label: string; style: CSSProperties; className?: string; title: string; onClick?: () => void };

export function LeaveMap({ from, days, employees, leaves, events, vans = [], meId, today, onLeave, onEvent }: Props) {
  const { t, i18n } = useTranslation();
  const sectorList = useSectors();
  const sn = useSectorName();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // no celular cabem poucos dias: começa com hoje perto da esquerda
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const i = daysBetween(from, today);
    if (el && i >= 0 && i < days) el.scrollLeft = Math.max(0, (i - 1) * DAY_W);
  }, [from, today, days]);
  const to = addDays(from, days - 1);
  const width = days * DAY_W;
  const dates = useMemo(() => dayRange(from, to), [from, to]);
  const all = useMemo(() => absences(leaves, events), [leaves, events]);
  const conflictDays = useMemo(() => sectorConflictDays(employees, all, from, to), [employees, all, from, to]);
  const clashes = useMemo(() => vanClashes(events), [events]);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "";

  const months = useMemo(() => {
    const out: { label: string; days: number }[] = [];
    for (const d of dates) {
      const label = new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
      if (out.at(-1)?.label === label) out.at(-1)!.days++;
      else out.push({ label, days: 1 });
    }
    return out;
  }, [dates, i18n.language]);

  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit" });
  const span = (s: string, e: string) => (s === e ? fmt(s) : `${fmt(s)} – ${fmt(e)}`);

  const leaveBar = (l: Leave): Bar => {
    const approved = l.status === "approved";
    const label = t(`fe.status.${l.status}`);
    return {
      key: `l${l.id}`, start: l.start_date, end: l.end_date, label: l.hours ? `${String(l.hours).replace(".", ",")}h ${label}` : l.part !== "full" ? `½ ${label}` : label,
      title: `${nameOf(l.employee_id)} · ${label} · ${span(l.start_date, l.end_date)}`,
      style: approved ? { backgroundColor: "hsl(var(--italy-green))", color: "white" }
        : { backgroundImage: "repeating-linear-gradient(135deg, hsl(var(--foreground) / .18) 0 4px, hsl(var(--foreground) / .06) 4px 8px)" },
      className: approved ? "" : "border border-foreground/40 text-foreground",
      onClick: onLeave ? () => onLeave(l) : undefined,
    };
  };
  const eventBar = (ev: AgendaEvent, clash = false): Bar => ({
    key: `e${ev.id}`, start: ev.start_date, end: ev.end_date, label: ev.title,
    title: `${t(`fe.kind.${ev.kind}`)} · ${ev.title} · ${span(ev.start_date, ev.end_date)}${ev.start_time ? ` · ${ev.start_time.slice(0, 5)}` : ""}`,
    style: ev.kind === "block"
      ? { backgroundImage: "repeating-linear-gradient(135deg, hsl(var(--destructive) / .85) 0 5px, hsl(var(--destructive) / .65) 5px 10px)", color: "white" }
      : ev.kind === "meeting" ? { backgroundColor: "hsl(var(--foreground))", color: "white" }
        : ev.kind === "van" ? { backgroundColor: clash ? "hsl(var(--destructive))" : "hsl(var(--primary-variant))", color: "white" }
          : { backgroundColor: "hsl(var(--muted-foreground))", color: "white" },
    onClick: onEvent ? () => onEvent(ev) : undefined,
  });

  const personBars = (e: Employee): Bar[] => [
    ...leaves.filter((l) => l.employee_id === e.id && isActive(l)).map(leaveBar),
    ...events.filter((ev) => ev.kind !== "van" && ev.kind !== "block" && ev.employee_ids.includes(e.id)).map((ev) => eventBar(ev)),
  ];

  const companyEvents = events.filter((ev) => (ev.kind === "block" || ev.kind === "meeting") && !ev.sector && ev.employee_ids.length === 0);
  const nameCell = "sticky left-0 z-10 shrink-0 border-r border-border bg-card";
  const toggle = (k: string) => setClosed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const Track = ({ bars, conflicts }: { bars: Bar[]; conflicts?: Set<string> }) => (
    <div className="relative h-full min-h-9 shrink-0" style={{ width, backgroundImage: grid }}>
      {dates.map((d, i) => (isWeekend(d) || d === today || conflicts?.has(d)) && (
        <div key={d} aria-hidden="true" className={cn("absolute inset-y-0",
          conflicts?.has(d) ? "bg-destructive/25" : d === today ? "bg-foreground/10" : "bg-foreground/[0.04]")}
          style={{ left: i * DAY_W, width: DAY_W }} />
      ))}
      {bars.filter((b) => b.end >= from && b.start <= to).map((b) => {
        const s = b.start < from ? from : b.start;
        const e = b.end > to ? to : b.end;
        const Tag = b.onClick ? "button" : "div";
        return (
          <Tag key={b.key} type={b.onClick ? "button" : undefined} onClick={b.onClick} title={b.title}
            className={cn("absolute inset-y-1.5 overflow-hidden rounded-sm px-1 text-left text-[10px] font-semibold leading-[18px] whitespace-nowrap", b.className, b.onClick && "hover:ring-2 hover:ring-foreground")}
            style={{ left: daysBetween(from, s) * DAY_W + 1, width: (daysBetween(s, e) + 1) * DAY_W - 2, ...b.style }}>
            {b.label}
          </Tag>
        );
      })}
    </div>
  );

  const Row = ({ name, sub, bars, faded, me, conflicts, header, onToggle, open }: {
    name: string; sub?: string; bars: Bar[]; faded?: boolean; me?: boolean; conflicts?: Set<string>;
    header?: boolean; onToggle?: () => void; open?: boolean;
  }) => (
    <div className={cn("flex border-b border-border/60", header && "bg-secondary/40")}>
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={open}
          className={cn(nameCell, "flex items-center gap-1.5 px-2 py-2 text-left text-xs font-bold uppercase tracking-[0.08em] hover:bg-secondary")}
          style={{ width: "var(--map-name)" }}>
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{name}</span>
          {sub && <span className="ml-auto shrink-0 text-[10px] font-semibold text-destructive normal-case tracking-normal">{sub}</span>}
        </button>
      ) : (
        <div className={cn(nameCell, "px-2 py-1.5 pl-7 max-sm:pl-2", faded && "text-muted-foreground")} style={{ width: "var(--map-name)" }}>
          <div className={cn("truncate text-sm max-sm:text-xs", me ? "font-bold" : "font-medium")}>{name}</div>
          {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
        </div>
      )}
      <div className={cn("flex", faded && "opacity-60")}><Track bars={bars} conflicts={conflicts} /></div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <Legend style={{ backgroundColor: "hsl(var(--italy-green))" }}>{t("fe.status.approved")}</Legend>
        <Legend className="border border-foreground/40" style={{ backgroundImage: "repeating-linear-gradient(135deg, hsl(var(--foreground) / .18) 0 4px, hsl(var(--foreground) / .06) 4px 8px)" }}>{t("fe.legend.pending")}</Legend>
        <Legend style={{ backgroundColor: "hsl(var(--destructive))" }}>{t("fe.kind.block")}</Legend>
        <Legend style={{ backgroundColor: "hsl(var(--foreground))" }}>{t("fe.kind.meeting")}</Legend>
        <Legend style={{ backgroundColor: "hsl(var(--muted-foreground))" }}>{t("fe.legend.away")}</Legend>
        <Legend className="bg-destructive/25">{t("fe.legend.conflict")}</Legend>
      </div>
      <div ref={scroller} className="overflow-x-auto rounded-lg border border-border bg-card [--map-name:200px] max-sm:[--map-name:104px]">
        <div className="min-w-max">
          <div className="flex">
            <div className={nameCell} style={{ width: "var(--map-name)" }} />
            <div className="flex shrink-0" style={{ width }}>
              {months.map((m, i) => (
                <div key={i} className="border-r border-border bg-secondary py-1.5 text-left text-xs font-semibold capitalize" style={{ width: m.days * DAY_W }}>
                  {/* o nome do mês acompanha a rolagem, para não sumir à esquerda */}
                  <span className="sticky left-[var(--map-name)] block w-max max-w-full truncate px-2">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex border-b border-border">
            <div className={nameCell} style={{ width: "var(--map-name)" }} />
            <div className="flex shrink-0" style={{ width }}>
              {dates.map((d) => (
                <div key={d} className={cn("border-r border-border/60 py-1 text-center text-[10px] tabular-nums",
                  d === today ? "bg-foreground text-background font-bold" : isWeekend(d) ? "text-muted-foreground/60" : "text-muted-foreground")} style={{ width: DAY_W }}>
                  {+d.slice(8, 10)}
                </div>
              ))}
            </div>
          </div>

          <Row name={t("fe.map.company")} header bars={companyEvents.map((ev) => eventBar(ev))} />

          {orderedSectors(sectorList, employees).map((sector: Sector) => {
            const primary = employees.filter((e) => e.primary_sector === sector);
            const secondary = employees.filter((e) => e.secondary_sector === sector);
            if (!primary.length && !secondary.length) return null;
            const conflicts = conflictDays.get(sector);
            const open = !closed.has(sector);
            const sectorEvents = events.filter((ev) => (ev.kind === "block" || ev.kind === "meeting") && ev.sector === sector);
            return (
              <div key={sector}>
                <Row name={sn(sector)} header open={open} onToggle={() => toggle(sector)}
                  sub={conflicts?.size ? t("fe.map.conflicts", { count: conflicts.size }) : undefined}
                  conflicts={conflicts} bars={sectorEvents.map((ev) => eventBar(ev))} />
                {open && primary.map((e) => (
                  <Row key={e.id} name={e.name} me={e.id === meId} bars={personBars(e)}
                    sub={e.secondary_sector ? `+ ${sn(e.secondary_sector)}` : undefined} />
                ))}
                {open && secondary.map((e) => (
                  <Row key={`s${e.id}`} name={e.name} faded me={e.id === meId} bars={personBars(e)}
                    sub={t("fe.map.secondaryOf", { sector: sn(e.primary_sector) })} />
                ))}
              </div>
            );
          })}

          {vans.length > 0 && (
            <div>
              <Row name={t("fe.map.vans")} header open={!closed.has("vans")} onToggle={() => toggle("vans")} bars={[]} />
              {!closed.has("vans") && vans.map((v) => (
                <Row key={v.id} name={v.name} sub={v.plate ?? undefined}
                  bars={events.filter((ev) => ev.kind === "van" && ev.van_id === v.id).map((ev) => eventBar(ev, clashes.has(ev.id)))} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ children, className, style }: { children: string; className?: string; style?: CSSProperties }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-5 rounded-sm", className)} style={style} aria-hidden="true" />
      {children}
    </span>
  );
}

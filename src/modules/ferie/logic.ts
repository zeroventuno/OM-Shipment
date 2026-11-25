/*
 * Regras do controle de férias, sem React nem banco: setores, dias, quem está
 * fora em cada dia e os conflitos dentro de um setor.
 *
 * Conflito: duas ou mais pessoas de um mesmo setor fora no mesmo dia. Uma
 * pessoa conta no setor principal e no secundário. Férias negadas ou
 * canceladas não contam; pendentes e com outra data sugerida contam (é aí que
 * o aviso ajuda a decidir). Viagens de trabalho e reuniões externas também
 * deixam a pessoa fora.
 */

export const SECTORS = ["officina", "amministrazione", "magazzino", "commerciali", "marketing", "cycling_tour"] as const;
export type Sector = (typeof SECTORS)[number];

export type LeaveStatus = "pending" | "approved" | "rejected" | "proposed" | "cancelled";
export type DayPart = "full" | "am" | "pm";
export type EventKind = "block" | "meeting" | "travel" | "external" | "van";
export const EVENT_KINDS: EventKind[] = ["block", "meeting", "travel", "external", "van"];

export interface Employee {
  id: string;
  name: string;
  primary_sector: Sector;
  secondary_sector: Sector | null;
}

export interface Leave {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  part: DayPart;
  status: LeaveStatus;
  proposed_start?: string | null;
  proposed_end?: string | null;
}

export interface AgendaEvent {
  id: string;
  kind: EventKind;
  title: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  sector: Sector | null;
  employee_ids: string[];
  van_id?: string | null;
}

/** Situações que ocupam o dia no mapa e contam para conflito. */
export const ACTIVE_STATUSES: LeaveStatus[] = ["pending", "approved", "proposed"];
export const isActive = (l: Pick<Leave, "status">) => ACTIVE_STATUSES.includes(l.status);
/** Eventos que tiram a pessoa do escritório. */
export const AWAY_KINDS: EventKind[] = ["travel", "external"];

// --- Datas (sempre "AAAA-MM-DD", sem fuso) ---------------------------------

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const isoFromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoFromUtc(toUtc(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && aEnd >= bStart;
/** 0 = domingo, 6 = sábado */
export const weekday = (iso: string) => new Date(toUtc(iso)).getUTCDay();
export const isWeekend = (iso: string) => [0, 6].includes(weekday(iso));

export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Dias úteis (seg–sex) de um pedido; meio dia vale 0,5. */
export function workingDays(l: Pick<Leave, "start_date" | "end_date" | "part">): number {
  const n = dayRange(l.start_date, l.end_date).filter((d) => !isWeekend(d)).length;
  return l.part === "full" ? n : n * 0.5;
}

export const sectorsOf = (e: Pick<Employee, "primary_sector" | "secondary_sector">): Sector[] =>
  e.secondary_sector ? [e.primary_sector, e.secondary_sector] : [e.primary_sector];

/** Pessoas de um setor: primeiro as do setor principal, depois as do secundário. */
export function sectorMembers(sector: Sector, employees: Employee[]) {
  return {
    primary: employees.filter((e) => e.primary_sector === sector),
    secondary: employees.filter((e) => e.secondary_sector === sector),
  };
}

// --- Ausências --------------------------------------------------------------

export interface Absence {
  employee_id: string;
  start_date: string;
  end_date: string;
  source: "leave" | "event";
  ref: string;
  label?: string;
}

/** Quem está fora e quando: férias ativas + viagens e reuniões externas. */
export function absences(leaves: Leave[], events: AgendaEvent[]): Absence[] {
  const out: Absence[] = leaves.filter(isActive).map((l) => ({
    employee_id: l.employee_id, start_date: l.start_date, end_date: l.end_date, source: "leave" as const, ref: l.id,
  }));
  for (const ev of events) {
    if (!AWAY_KINDS.includes(ev.kind)) continue;
    for (const id of ev.employee_ids) {
      out.push({ employee_id: id, start_date: ev.start_date, end_date: ev.end_date, source: "event", ref: ev.id, label: ev.title });
    }
  }
  return out;
}

export interface ConflictPeer {
  employee: Employee;
  sector: Sector;
  /** o setor em comum é o secundário de alguém */
  viaSecondary: boolean;
  start_date: string;
  end_date: string;
  source: Absence["source"];
}

/**
 * Com quem um período de uma pessoa bate: outras pessoas que dividem algum
 * setor com ela e estão fora em algum desses dias.
 */
export function conflictsFor(
  person: Employee, start: string, end: string, employees: Employee[], all: Absence[], ignoreRef?: string,
): ConflictPeer[] {
  const mine = sectorsOf(person);
  const out: ConflictPeer[] = [];
  const seen = new Set<string>();
  for (const a of all) {
    if (a.employee_id === person.id || a.ref === ignoreRef || !overlaps(start, end, a.start_date, a.end_date)) continue;
    const other = employees.find((e) => e.id === a.employee_id);
    if (!other) continue;
    const shared = mine.find((s) => sectorsOf(other).includes(s));
    if (!shared) continue;
    const key = `${other.id}:${a.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      employee: other, sector: shared,
      viaSecondary: person.secondary_sector === shared || other.secondary_sector === shared,
      start_date: a.start_date, end_date: a.end_date, source: a.source,
    });
  }
  return out.sort((x, y) => x.start_date.localeCompare(y.start_date) || x.employee.name.localeCompare(y.employee.name));
}

/** Para cada setor, os dias (dentro da janela) com duas ou mais pessoas fora. */
export function sectorConflictDays(
  employees: Employee[], all: Absence[], from: string, to: string,
): Map<Sector, Set<string>> {
  const result = new Map<Sector, Set<string>>();
  for (const sector of SECTORS) {
    const members = new Set(employees.filter((e) => sectorsOf(e).includes(sector)).map((e) => e.id));
    const perDay = new Map<string, Set<string>>();
    for (const a of all) {
      if (!members.has(a.employee_id) || !overlaps(a.start_date, a.end_date, from, to)) continue;
      const s = a.start_date < from ? from : a.start_date;
      const e = a.end_date > to ? to : a.end_date;
      for (const d of dayRange(s, e)) {
        if (isWeekend(d)) continue;
        if (!perDay.has(d)) perDay.set(d, new Set());
        perDay.get(d)!.add(a.employee_id);
      }
    }
    const days = new Set([...perDay].filter(([, ids]) => ids.size >= 2).map(([d]) => d));
    if (days.size) result.set(sector, days);
  }
  return result;
}

/** Bloqueio que pega o período para essa pessoa (empresa toda ou um setor dela). */
export function blockingEvent(person: Employee, start: string, end: string, events: AgendaEvent[]): AgendaEvent | undefined {
  const mine = sectorsOf(person);
  return events.find((ev) => ev.kind === "block" && overlaps(start, end, ev.start_date, ev.end_date)
    && (!ev.sector || mine.includes(ev.sector)));
}

/** Reservas de um mesmo furgão que se cruzam. */
export function vanClashes(events: AgendaEvent[]): Set<string> {
  const vans = events.filter((e) => e.kind === "van" && e.van_id);
  const out = new Set<string>();
  for (let i = 0; i < vans.length; i++) {
    for (let j = i + 1; j < vans.length; j++) {
      const a = vans[i], b = vans[j];
      if (a.van_id === b.van_id && overlaps(a.start_date, a.end_date, b.start_date, b.end_date)) { out.add(a.id); out.add(b.id); }
    }
  }
  return out;
}

/** Problema no pedido do formulário (chave de tradução) ou null. */
export function validateLeave(d: { start_date: string; end_date: string; part: DayPart }, today: string): string | null {
  if (!d.start_date || !d.end_date) return "fe.err.dates";
  if (d.end_date < d.start_date) return "fe.err.order";
  if (d.start_date < today) return "fe.err.past";
  if (daysBetween(d.start_date, d.end_date) > 60) return "fe.err.long";
  if (d.part !== "full" && d.start_date !== d.end_date) return "fe.err.half";
  return null;
}

/** Link pessoal: 32 caracteres aleatórios, seguros para URL. */
export function newLinkToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Hoje em Roma, "AAAA-MM-DD". */
export const todayRome = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

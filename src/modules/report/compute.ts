/**
 * Report annuale: solo i conti. Nessun React e nessun Supabase qui dentro,
 * così i test girano in Node con dati finti.
 *
 * data.ts carica le righe, ReportPage.tsx le disegna. Le conclusioni escono
 * come chiave i18n + variabili: la pagina le scrive nella lingua di chi legge.
 */

// ───────────────────────── righe in ingresso ─────────────────────────

export type ShipmentRow = {
  id: string;
  created_at: string;
  order_type: string | null;
  customer_name: string | null;
  quantity: number | null;
  destination_country: string | null;
  customer_payment: number | string | null;
  tracking_code: string | null;
  selected_quote: { portal?: string | null; carrier?: string | null; price?: number | string | null } | null;
  savings: number | string | null;
  customer_cost_pickup: boolean | null;
  ticket_id: string | null;
  warranty_id: string | null;
  service_level: string | null;
  agent: string | null;
  request_id: string | null;
};

export type TicketRow = {
  id: string;
  created_at: string;
  brand: string | null;
  phase: string | null;
  approval_status: string | null;
  completion_date: string | null;
  shipping_cost: number | string | null;
};

export type HistoryEntry = { date?: string | null; field?: string | null; newValue?: unknown };

export type WarrantyRow = {
  id: string;
  created_at: string;
  start_date: string | null;
  process_type: string | null;
  status: string | null;
  solution: string | null;
  producer: string | null;
  value: string | number | null;
  shipping_cost: number | string | null;
  history: HistoryEntry[] | null;
  updated_at: string | null;
};

export type RequestRow = {
  id: string;
  created_at: string;
  status: string | null;
  service_level: string | null;
  invoice_value: number | string | null;
  insured_value: number | string | null;
  shipment_id: string | null;
};

/** solo nome e data: lo storico per capire chi è cliente nuovo */
export type NameRow = { customer_name: string | null; created_at: string };

export type ReportInput = {
  shipments: ShipmentRow[];
  tickets: TicketRow[];
  warranties: WarrantyRow[];
  requests: RequestRow[];
  /** spedizioni degli anni precedenti al precedente (solo nome e data) */
  olderNames: NameRow[];
  /** per collegare richiesta → spedizione quando la spedizione è fuori dai due anni */
  requestShipments?: { id: string; created_at: string }[];
};

// ───────────────────────── utilità ─────────────────────────

/** numero da numeric/stringa; 0 quando non si legge */
export function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : parseMoney(v) ?? 0;
  }
  return 0;
}

/**
 * Importo scritto a mano: "350.00", "350,00", "1.234,56", "1,234.56", "€ 350".
 * null quando non c'è un numero.
 */
export function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // il separatore che viene dopo è quello dei decimali
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    const many = s.split(",").length > 2;
    s = !many && after > 0 && after <= 2 ? s.replace(",", ".") : s.split(",").join("");
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    const many = s.split(".").length > 2;
    if (many || after === 3) s = s.split(".").join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** nome del cliente per confrontare: minuscolo, senza accenti e senza simboli */
export function normName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const romeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });

/** il giorno (YYYY-MM-DD) a Roma; una data semplice resta com'è */
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return romeDay.format(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export interface CustomerBalance {
  key: string;
  name: string;
  /** spedizioni dell'anno */
  n: number;
  cost: number;
  paid: number;
  balance: number;
  /** spedizioni con un costo e niente pagato dal cliente */
  unpaid: number;
  /** agente più frequente nelle sue spedizioni ("" se nessuno) */
  agent: string;
}

/** Saldo per cliente (pagato − costo). Le spedizioni ritirate dal cliente valgono zero. */
export function customerBalances(ships: ShipmentRow[], nameOf: (s: ShipmentRow) => string, keyOf: (s: ShipmentRow) => string): CustomerBalance[] {
  const map = new Map<string, CustomerBalance & { agents: Map<string, number> }>();
  for (const s of ships) {
    const key = keyOf(s);
    if (!key) continue;
    const b = map.get(key) ?? { key, name: nameOf(s), n: 0, cost: 0, paid: 0, balance: 0, unpaid: 0, agent: "", agents: new Map<string, number>() };
    const cost = costOf(s);
    const paid = toNum(s.customer_payment);
    b.n += 1;
    b.cost += cost;
    b.paid += paid;
    if (cost > 0 && paid <= 0) b.unpaid += 1;
    const ag = (s.agent ?? "").trim();
    if (ag) b.agents.set(ag, (b.agents.get(ag) ?? 0) + 1);
    map.set(key, b);
  }
  return [...map.values()].map(({ agents, ...b }) => ({
    ...b,
    balance: Math.round((b.paid - b.cost) * 100) / 100,
    agent: [...agents].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "",
  }));
}

/** il costo del trasporto della spedizione (prezzo del preventivo scelto) */
export function costOf(s: ShipmentRow): number {
  return Math.max(0, toNum(s.selected_quote?.price));
}

export const ITALY = "IT";
/** il paese raggruppato: codice ISO quando si conosce */
export type CountryFn = (stored: string) => string;

// ───────────────────────── modello ─────────────────────────

export type Totals = {
  shipments: number;
  cost: number;
  paid: number;
  balance: number;
  savings: number;
  customers: number;
  tickets: number;
  warranties: number;
  /** spedizioni con costo (per il costo medio) */
  priced: number;
};

export type Group = { key: string; n: number; cost: number; priced: number };

export type MonthRow = { shipments: number; cost: number; paid: number; balance: number; priced: number; prevCost: number; prevShipments: number };

export type YearModel = {
  year: number;
  prevYear: number;
  current: boolean;
  today: string;
  totals: Totals;
  prev: Totals;
  /** confronto giusto: con l'anno in corso, i due anni fino allo stesso giorno */
  compare: { now: Totals; prev: Totals; until: string | null } | null;
  months: MonthRow[];
  service: { standard: Group; express: Group };
  pickup: number;
  portals: Group[];
  carriers: Group[];
  savingsPct: number;
  geo: { italy: Group; abroad: Group; noCountry: number; countries: (Group & { label: string })[] };
  orderTypes: Group[];
  customers: {
    active: number;
    fresh: number;
    returning: number;
    byCount: (Group & { name: string })[];
    byCost: (Group & { name: string })[];
    /** quota delle spedizioni fatta dai 10 clienti principali */
    top10Share: number;
  };
  agents: Group[];
  /** saldo trasporti per cliente: quanto ha pagato meno quanto è costato */
  balance: {
    inProfit: number;
    inLoss: number;
    profitTotal: number;
    lossTotal: number;
    /** quota della perdita totale fatta dai 10 clienti peggiori */
    worst10Share: number;
    best: CustomerBalance[];
    worst: CustomerBalance[];
  };
  tickets: {
    count: number;
    phases: Group[];
    approved: number;
    rejected: number;
    approvalRate: number | null;
    avgDays: number | null;
    measured: number;
    brands: Group[];
    shippingCost: number;
    linkedShipments: number;
    /** costo dei trasporti delle spedizioni collegate a un ticket */
    linkedCost: number;
  };
  warranties: {
    count: number;
    covered: number;
    paid: number;
    solutions: Group[];
    producers: Group[];
    valuePaid: number;
    valueTotal: number;
    withValue: number;
    avgDays: number | null;
    measured: number;
    open: number;
    stalled: number;
    shippingCost: number;
  };
  requests: {
    count: number;
    pending: number;
    shipped: number;
    cancelled: number;
    express: number;
    invoiceTotal: number;
    insuredTotal: number;
    withoutInsurance: number;
    avgDaysToShip: number | null;
    measured: number;
  };
  quality: {
    noCost: number;
    noTracking: number;
    noCountry: number;
    noAgent: number;
    warrantyNoValue: number;
    ticketNoDate: number;
  };
};

const emptyTotals = (): Totals => ({ shipments: 0, cost: 0, paid: 0, balance: 0, savings: 0, customers: 0, tickets: 0, warranties: 0, priced: 0 });

function totalsOf(ships: ShipmentRow[], tickets: number, warranties: number): Totals {
  const t = emptyTotals();
  const names = new Set<string>();
  for (const s of ships) {
    const c = costOf(s);
    t.shipments += 1;
    t.cost += c;
    if (c > 0) t.priced += 1;
    t.paid += toNum(s.customer_payment);
    t.savings += Math.max(0, toNum(s.savings));
    const k = normName(s.customer_name);
    if (k) names.add(k);
  }
  t.balance = t.paid - t.cost;
  t.customers = names.size;
  t.tickets = tickets;
  t.warranties = warranties;
  return t;
}

function groupBy<T>(rows: T[], keyOf: (r: T) => string, costFn: (r: T) => number = () => 0): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r);
    const g = map.get(key) ?? { key, n: 0, cost: 0, priced: 0 };
    const c = costFn(r);
    g.n += 1;
    g.cost += c;
    if (c > 0) g.priced += 1;
    map.set(key, g);
  }
  return Array.from(map.values());
}
/**
 * Como groupBy, mas junta grafias que só mudam nas maiúsculas ("ENVE", "Enve",
 * "enve"); o rótulo é a grafia mais usada.
 */
function groupCaseless<T>(rows: T[], labelOf: (r: T) => string): Group[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const label = labelOf(r);
    const k = label.toLocaleLowerCase();
    const m = spellings.get(k) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    spellings.set(k, m);
  }
  return groupBy(rows, (r) => labelOf(r).toLocaleLowerCase()).map((g) => {
    const best = [...(spellings.get(g.key) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
    return { ...g, key: best ? best[0] : g.key };
  });
}
const byCost = (a: Group, b: Group) => b.cost - a.cost || b.n - a.n || a.key.localeCompare(b.key);
const byCount = (a: Group, b: Group) => b.n - a.n || b.cost - a.cost || a.key.localeCompare(b.key);

const trim = (s: string | null | undefined) => (s ?? "").trim();
const yearOfDay = (d: string) => Number(d.slice(0, 4));

/** la data d'inizio della garanzia: start_date, altrimenti la creazione */
const warrantyStart = (w: WarrantyRow) => dayOf(w.start_date) || dayOf(w.created_at);

/** quando la garanzia è stata chiusa: dalla cronologia, altrimenti l'ultimo aggiornamento */
export function warrantyCompletion(w: WarrantyRow): string {
  if (w.status !== "Completato") return "";
  const hits = (w.history ?? []).filter((h) => h && h.field === "status" && h.newValue === "Completato" && h.date);
  if (hits.length) return dayOf(hits.map((h) => h.date as string).sort().at(-1));
  return dayOf(w.updated_at);
}

/** l'ultima attività sul caso: la voce più recente della cronologia o l'aggiornamento */
function lastActivity(w: WarrantyRow): string {
  const dates = (w.history ?? []).map((h) => dayOf(h?.date ?? "")).filter(Boolean);
  dates.push(dayOf(w.updated_at), warrantyStart(w));
  return dates.filter(Boolean).sort().at(-1) ?? "";
}

export const STALLED_DAYS = 30;

/** le fasi dell'assistenza nell'ordine del flusso di lavoro */
const PHASES = ["Ingresso", "Spedito", "In lavorazione", "Completato"];
const phaseRank = (p: string) => (PHASES.includes(p) ? PHASES.indexOf(p) : PHASES.length);

export function buildReport(input: ReportInput, opts: { year: number; today: string; country: CountryFn }): YearModel {
  const { year, today, country } = opts;
  const prevYear = year - 1;
  const current = Number(today.slice(0, 4)) === year;
  const md = today.slice(5);

  const withDay = input.shipments.map((s) => ({ s, day: dayOf(s.created_at) }));
  const rows = withDay.filter((x) => yearOfDay(x.day) === year);
  const prevRows = withDay.filter((x) => yearOfDay(x.day) === prevYear);
  const ships = rows.map((x) => x.s);

  const ticketsDay = input.tickets.map((t) => ({ t, day: dayOf(t.created_at) }));
  const tickets = ticketsDay.filter((x) => yearOfDay(x.day) === year).map((x) => x.t);
  const prevTickets = ticketsDay.filter((x) => yearOfDay(x.day) === prevYear);
  const warrDay = input.warranties.map((w) => ({ w, day: warrantyStart(w) }));
  const warranties = warrDay.filter((x) => yearOfDay(x.day) === year).map((x) => x.w);
  const prevWarr = warrDay.filter((x) => yearOfDay(x.day) === prevYear);

  const totals = totalsOf(ships, tickets.length, warranties.length);
  const prev = totalsOf(prevRows.map((x) => x.s), prevTickets.length, prevWarr.length);

  let compare: YearModel["compare"] = null;
  if (prev.shipments > 0) {
    if (current) {
      const upTo = <T extends { day: string }>(xs: T[]) => xs.filter((x) => x.day.slice(5) <= md);
      const now = totalsOf(upTo(rows).map((x) => x.s), upTo(ticketsDay.filter((x) => yearOfDay(x.day) === year)).length, upTo(warrDay.filter((x) => yearOfDay(x.day) === year)).length);
      const before = totalsOf(upTo(prevRows).map((x) => x.s), upTo(prevTickets).length, upTo(prevWarr).length);
      if (before.shipments > 0) compare = { now, prev: before, until: today };
    } else {
      compare = { now: totals, prev, until: null };
    }
  }

  const months: MonthRow[] = Array.from({ length: 12 }, () => ({ shipments: 0, cost: 0, paid: 0, balance: 0, priced: 0, prevCost: 0, prevShipments: 0 }));
  for (const { s, day } of rows) {
    const m = months[Number(day.slice(5, 7)) - 1];
    const c = costOf(s);
    m.shipments += 1;
    m.cost += c;
    if (c > 0) m.priced += 1;
    m.paid += toNum(s.customer_payment);
  }
  for (const m of months) m.balance = m.paid - m.cost;
  for (const { s, day } of prevRows) {
    const m = months[Number(day.slice(5, 7)) - 1];
    m.prevCost += costOf(s);
    m.prevShipments += 1;
  }

  // servizio e ritiro del cliente
  const svc = groupBy(ships, (s) => (s.service_level === "express" ? "express" : "standard"), costOf);
  const empty = (key: string): Group => ({ key, n: 0, cost: 0, priced: 0 });
  const service = { standard: svc.find((g) => g.key === "standard") ?? empty("standard"), express: svc.find((g) => g.key === "express") ?? empty("express") };
  const pickup = ships.filter((s) => s.customer_cost_pickup).length;

  // portali e corrieri: solo le spedizioni con un preventivo scelto
  const quoted = ships.filter((s) => s.selected_quote && (trim(s.selected_quote.portal) || trim(s.selected_quote.carrier)));
  const portals = groupBy(quoted, (s) => trim(s.selected_quote?.portal) || "—", costOf).sort(byCost);
  const carriers = groupBy(quoted, (s) => trim(s.selected_quote?.carrier) || "—", costOf).sort(byCost);
  const savingsPct = share(totals.savings, totals.cost + totals.savings);

  // destinazioni
  const withCountry = ships.filter((s) => trim(s.destination_country));
  const labelOf = new Map<string, string>();
  for (const s of withCountry) {
    const k = country(trim(s.destination_country));
    if (!labelOf.has(k)) labelOf.set(k, trim(s.destination_country));
  }
  const countries = groupBy(withCountry, (s) => country(trim(s.destination_country)), costOf)
    .sort(byCount)
    .map((g) => ({ ...g, label: labelOf.get(g.key) ?? g.key }));
  const sum = (gs: Group[]): Group => gs.reduce((a, g) => ({ key: a.key, n: a.n + g.n, cost: a.cost + g.cost, priced: a.priced + g.priced }), empty(""));
  const italy = { ...sum(countries.filter((c) => c.key === ITALY)), key: "italy" };
  const abroad = { ...sum(countries.filter((c) => c.key !== ITALY)), key: "abroad" };

  const orderTypes = groupBy(ships, (s) => trim(s.order_type) || "Other", costOf).sort(byCount);

  // clienti: nuovo è chi non ha mai spedito prima di quest'anno
  const earlier = new Set<string>();
  for (const r of input.olderNames) if (yearOfDay(dayOf(r.created_at)) < year) earlier.add(normName(r.customer_name));
  for (const { s, day } of withDay) if (yearOfDay(day) < year) earlier.add(normName(s.customer_name));
  const named = ships.filter((s) => normName(s.customer_name));
  const nameOf = new Map<string, string>();
  for (const s of named) {
    const k = normName(s.customer_name);
    if (!nameOf.has(k)) nameOf.set(k, trim(s.customer_name));
  }
  const perCustomer = groupBy(named, (s) => normName(s.customer_name), costOf).map((g) => ({ ...g, name: nameOf.get(g.key) ?? g.key }));
  const active = perCustomer.length;
  const returning = perCustomer.filter((g) => earlier.has(g.key)).length;
  const topCount = [...perCustomer].sort(byCount);
  const top10Share = share(topCount.slice(0, 10).reduce((s, g) => s + g.n, 0), named.length);

  const agents = groupBy(ships, (s) => trim(s.agent), costOf).sort(byCount);

  // saldo per cliente: i migliori e i peggiori (sotto 50 centesimi conta come pari)
  const balances = customerBalances(named, (s) => nameOf.get(normName(s.customer_name)) ?? trim(s.customer_name), (s) => normName(s.customer_name));
  const gains = balances.filter((b) => b.balance >= 0.5).sort((a, b) => b.balance - a.balance);
  const losses = balances.filter((b) => b.balance <= -0.5).sort((a, b) => a.balance - b.balance);
  const lossTotal = losses.reduce((s, b) => s + b.balance, 0);
  const balance = {
    inProfit: gains.length,
    inLoss: losses.length,
    profitTotal: gains.reduce((s, b) => s + b.balance, 0),
    lossTotal,
    // valores positivos: share() ignora totais negativos
    worst10Share: share(-losses.slice(0, 10).reduce((s, b) => s + b.balance, 0), -lossTotal),
    best: gains.slice(0, 10),
    worst: losses.slice(0, 10),
  };

  // assistenze
  const decided = tickets.filter((t) => t.approval_status === "Approvato" || t.approval_status === "Rifiutato");
  const approved = decided.filter((t) => t.approval_status === "Approvato").length;
  const ticketDays = tickets
    .filter((t) => t.phase === "Completato" && t.completion_date)
    .map((t) => daysBetween(dayOf(t.created_at), dayOf(t.completion_date)))
    .filter((d) => d >= 0);

  // garanzie
  const wDays = warranties
    .map((w) => ({ from: warrantyStart(w), to: warrantyCompletion(w) }))
    .filter((x) => x.from && x.to)
    .map((x) => daysBetween(x.from, x.to))
    .filter((d) => d >= 0);
  const values = warranties.map((w) => ({ w, v: parseMoney(w.value) }));
  const openW = warranties.filter((w) => w.status !== "Completato");
  const stalled = openW.filter((w) => {
    const last = lastActivity(w);
    return last && daysBetween(last, today) > STALLED_DAYS;
  }).length;

  // richieste di spedizione
  const reqs = input.requests.filter((r) => yearOfDay(dayOf(r.created_at)) === year);
  const shipDate = new Map<string, string>();
  for (const s of input.shipments) shipDate.set(s.id, s.created_at);
  for (const s of input.requestShipments ?? []) shipDate.set(s.id, s.created_at);
  const reqDays = reqs
    .filter((r) => r.status === "shipped" && r.shipment_id && shipDate.has(r.shipment_id))
    .map((r) => (Date.parse(shipDate.get(r.shipment_id as string) as string) - Date.parse(r.created_at)) / 86400000)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const live = reqs.filter((r) => r.status !== "cancelled");

  return {
    year,
    prevYear,
    current,
    today,
    totals,
    prev,
    compare,
    months,
    service,
    pickup,
    portals,
    carriers,
    savingsPct,
    geo: { italy, abroad, noCountry: ships.length - withCountry.length, countries },
    orderTypes,
    customers: {
      active,
      fresh: active - returning,
      returning,
      byCount: topCount.slice(0, 10),
      byCost: [...perCustomer].sort(byCost).slice(0, 10),
      top10Share,
    },
    agents,
    balance,
    tickets: {
      count: tickets.length,
      phases: groupBy(tickets, (t) => trim(t.phase) || "—").sort((a, b) => phaseRank(a.key) - phaseRank(b.key) || byCount(a, b)),
      approved,
      rejected: decided.length - approved,
      approvalRate: decided.length ? approved / decided.length : null,
      avgDays: avg(ticketDays),
      measured: ticketDays.length,
      brands: groupCaseless(tickets, (t) => trim(t.brand) || "—").sort(byCount),
      shippingCost: tickets.reduce((s, t) => s + toNum(t.shipping_cost), 0),
      linkedShipments: ships.filter((s) => s.ticket_id).length,
      linkedCost: ships.filter((s) => s.ticket_id).reduce((s, x) => s + costOf(x), 0),
    },
    warranties: {
      count: warranties.length,
      covered: warranties.filter((w) => w.process_type !== "A pagamento").length,
      paid: warranties.filter((w) => w.process_type === "A pagamento").length,
      solutions: groupBy(warranties, (w) => trim(w.solution)).sort(byCount),
      producers: groupCaseless(warranties, (w) => trim(w.producer) || "—").sort(byCount),
      valuePaid: values.filter((x) => x.w.process_type === "A pagamento").reduce((s, x) => s + (x.v ?? 0), 0),
      valueTotal: values.reduce((s, x) => s + (x.v ?? 0), 0),
      withValue: values.filter((x) => x.v != null && x.v > 0).length,
      avgDays: avg(wDays),
      measured: wDays.length,
      open: openW.length,
      stalled,
      shippingCost: warranties.reduce((s, w) => s + toNum(w.shipping_cost), 0),
    },
    requests: {
      count: reqs.length,
      pending: reqs.filter((r) => r.status === "pending").length,
      shipped: reqs.filter((r) => r.status === "shipped").length,
      cancelled: reqs.filter((r) => r.status === "cancelled").length,
      express: live.filter((r) => r.service_level === "express").length,
      invoiceTotal: live.reduce((s, r) => s + toNum(r.invoice_value), 0),
      insuredTotal: live.reduce((s, r) => s + toNum(r.insured_value), 0),
      withoutInsurance: live.filter((r) => toNum(r.insured_value) <= 0).length,
      avgDaysToShip: avg(reqDays),
      measured: reqDays.length,
    },
    quality: {
      // il ritiro del cliente non ha costo né tracking: non è un buco nei dati
      noCost: ships.filter((s) => !s.customer_cost_pickup && costOf(s) <= 0).length,
      noTracking: ships.filter((s) => !s.customer_cost_pickup && !trim(s.tracking_code)).length,
      noCountry: ships.length - withCountry.length,
      noAgent: ships.filter((s) => !trim(s.agent)).length,
      warrantyNoValue: values.filter((x) => x.v == null || x.v <= 0).length,
      ticketNoDate: tickets.filter((t) => t.phase === "Completato" && !t.completion_date).length,
    },
  };
}

// ───────────────────────── conclusioni ─────────────────────────

export type InsightVar =
  | { money: number; cents?: boolean }
  | { pct: number }
  | { n: number }
  | { dec: number }
  | { month: number }
  | { text: string }
  | { country: string }
  | { date: string };

export type Insight = { key: string; tone: "good" | "watch" | "info"; vars: Record<string, InsightVar> };

/** la sezione di una conclusione, dal prefisso della chiave (rep.ins.<sezione>.<nome>) */
export type InsightSection = "ship" | "carr" | "geo" | "cli" | "bal" | "ass" | "war" | "req" | "q";
export const sectionOf = (key: string): InsightSection => key.split(".")[2] as InsightSection;

/**
 * Le conclusioni, nell'ordine in cui vale la pena leggerle. Ognuna compare
 * solo quando i dati la sostengono: niente percentuali su tre spedizioni.
 */
export function buildInsights(r: YearModel): Insight[] {
  const out: Insight[] = [];
  const t = r.totals;
  const push = (key: string, tone: Insight["tone"], vars: Insight["vars"] = {}) => out.push({ key, tone, vars });
  const ytd = r.compare?.until ? "Ytd" : "";
  const prevVar = { text: String(r.prevYear) };

  if (t.shipments > 0) {
    const c = r.compare;
    if (c && c.prev.shipments > 0) {
      const dv = c.now.shipments / c.prev.shipments - 1;
      if (Math.abs(dv) >= 0.01) push(`rep.ins.ship.volume${dv > 0 ? "Up" : "Down"}${ytd}`, dv > 0 ? "good" : "info", { pct: { pct: Math.abs(dv) }, prev: prevVar, n: { n: c.now.shipments }, before: { n: c.prev.shipments } });
      if (c.now.priced > 0 && c.prev.priced > 0) {
        const a = c.now.cost / c.now.priced;
        const b = c.prev.cost / c.prev.priced;
        const d = a / b - 1;
        if (d >= 0.05) push("rep.ins.ship.avgCostUp", "watch", { pct: { pct: d }, now: { money: a, cents: true }, before: { money: b, cents: true }, prev: prevVar });
        else if (d <= -0.05) push("rep.ins.ship.avgCostDown", "good", { pct: { pct: -d }, now: { money: a, cents: true }, before: { money: b, cents: true }, prev: prevVar });
      }
    }

    if (t.cost > 0) {
      const rate = t.paid / t.cost;
      push("rep.ins.ship.recovery", rate >= 0.9 ? "good" : rate < 0.6 ? "watch" : "info", { pct: { pct: rate }, balance: { money: t.balance } });

      const order = r.months.map((m, i) => ({ i, ...m })).filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost);
      if (order.length >= 3) {
        const best = order[0];
        push("rep.ins.ship.peakMonth", "info", { month: { month: best.i }, n: { n: best.shipments }, cost: { money: best.cost }, pct: { pct: best.cost / t.cost } });
      }
    }

    if (r.service.express.n > 0 && t.shipments >= 10) {
      const e = r.service.express;
      const s = r.service.standard;
      push(
        e.priced > 0 && s.priced > 0 ? "rep.ins.ship.express" : "rep.ins.ship.expressShare",
        "info",
        { pct: { pct: e.n / t.shipments }, n: { n: e.n }, avgEx: { money: e.priced ? e.cost / e.priced : 0, cents: true }, avgStd: { money: s.priced ? s.cost / s.priced : 0, cents: true } },
      );
    }
    if (r.pickup > 0 && t.shipments >= 10) push("rep.ins.ship.pickup", "info", { n: { n: r.pickup }, pct: { pct: r.pickup / t.shipments } });
  }

  // corrieri
  const carrCost = r.carriers.reduce((s, g) => s + g.cost, 0);
  if (r.carriers.length > 1 && carrCost > 0) {
    const top = r.carriers[0];
    const sh = top.cost / carrCost;
    push(sh >= 0.6 ? "rep.ins.carr.dependent" : "rep.ins.carr.top", sh >= 0.6 ? "watch" : "info", { name: { text: top.key }, pct: { pct: sh }, n: { n: top.n } });
  }
  if (t.savings > 0) push("rep.ins.carr.savings", "good", { money: { money: t.savings }, pct: { pct: r.savingsPct } });

  // destinazioni
  const withC = r.geo.italy.n + r.geo.abroad.n;
  if (withC >= 10) {
    push("rep.ins.geo.italy", "info", { pct: { pct: r.geo.italy.n / withC }, abroad: { pct: r.geo.abroad.n / withC } });
    const foreign = r.geo.countries.filter((c) => c.key !== ITALY);
    const f = foreign[0];
    if (f && f.n >= 3) push(f.priced > 0 ? "rep.ins.geo.topAbroad" : "rep.ins.geo.topAbroadNoCost", "info", { country: { country: f.label }, n: { n: f.n }, avg: { money: f.priced ? f.cost / f.priced : 0, cents: true }, count: { n: foreign.length } });
  }

  // clienti e agenti
  const cu = r.customers;
  if (cu.active >= 5) {
    if (cu.fresh > 0) push("rep.ins.cli.new", "good", { n: { n: cu.fresh }, pct: { pct: cu.fresh / cu.active } });
    if (cu.active >= 20) push(cu.top10Share >= 0.5 ? "rep.ins.cli.concentrated" : "rep.ins.cli.spread", cu.top10Share >= 0.5 ? "watch" : "info", { pct: { pct: cu.top10Share } });
    const top = cu.byCount[0];
    if (top && top.n >= 3) push("rep.ins.cli.top", "info", { name: { text: top.name }, n: { n: top.n }, cost: { money: top.cost } });
  }
  const namedAgents = r.agents.filter((a) => a.key);
  if (namedAgents.length > 1 && t.shipments >= 10) push("rep.ins.cli.agent", "info", { name: { text: namedAgents[0].key }, n: { n: namedAgents[0].n }, pct: { pct: namedAgents[0].n / t.shipments } });

  // saldo per cliente
  const bal = r.balance;
  const best = bal.best[0];
  if (best && best.balance >= 50) push("rep.ins.bal.best", "good", { name: { text: best.name }, money: { money: best.balance }, n: { n: best.n } });
  const worst = bal.worst[0];
  if (worst && worst.balance <= -50) {
    push(worst.unpaid > 0 ? "rep.ins.bal.worstUnpaid" : "rep.ins.bal.worst", "watch", {
      name: { text: worst.name }, money: { money: -worst.balance }, n: { n: worst.n }, unpaid: { n: worst.unpaid },
    });
  }
  if (bal.inLoss >= 10 && bal.lossTotal < 0) {
    push("rep.ins.bal.concentration", bal.worst10Share >= 0.5 ? "watch" : "info", {
      n: { n: bal.inLoss }, money: { money: -bal.lossTotal }, pct: { pct: bal.worst10Share },
    });
  }

  // assistenze
  const tk = r.tickets;
  if (tk.avgDays != null && tk.measured >= 3) push("rep.ins.ass.duration", tk.avgDays > 45 ? "watch" : "info", { days: { dec: tk.avgDays }, n: { n: tk.measured } });
  if (tk.approvalRate != null && tk.approved + tk.rejected >= 5) push("rep.ins.ass.approval", tk.approvalRate >= 0.7 ? "good" : "watch", { pct: { pct: tk.approvalRate }, n: { n: tk.approved + tk.rejected } });

  // garanzie
  const w = r.warranties;
  if (w.paid > 0 && w.valuePaid > 0) push("rep.ins.war.paid", "good", { n: { n: w.paid }, money: { money: w.valuePaid } });
  if (w.avgDays != null && w.measured >= 3) push("rep.ins.war.duration", w.avgDays > 60 ? "watch" : "info", { days: { dec: w.avgDays }, n: { n: w.measured } });
  if (w.stalled > 0) push("rep.ins.war.stalled", "watch", { n: { n: w.stalled }, days: { n: STALLED_DAYS } });

  // richieste
  const rq = r.requests;
  const liveReq = rq.count - rq.cancelled;
  if (rq.withoutInsurance > 0 && liveReq > 0) push("rep.ins.req.noInsurance", "watch", { n: { n: rq.withoutInsurance }, total: { n: liveReq } });

  // qualità
  const q = r.quality;
  if (q.noCost > 0) push("rep.ins.q.noCost", "watch", { n: { n: q.noCost } });
  if (q.noTracking > 0) push("rep.ins.q.noTracking", "watch", { n: { n: q.noTracking } });
  if (q.noAgent > 0 && t.shipments > 0 && q.noAgent / t.shipments >= 0.2) push("rep.ins.q.noAgent", "watch", { n: { n: q.noAgent }, pct: { pct: q.noAgent / t.shipments } });
  if (q.warrantyNoValue > 0) push("rep.ins.q.warrantyNoValue", "watch", { n: { n: q.warrantyNoValue } });
  return out;
}

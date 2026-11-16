import { describe, expect, it } from "vitest";
import { buildInsights, buildReport, customerBalances, dayOf, normName, parseMoney, warrantyCompletion, type ReportInput, type ShipmentRow, type TicketRow, type WarrantyRow } from "./compute";
import { reportResources } from "./i18n";

const COUNTRY: Record<string, string> = { "Itália": "IT", Italia: "IT", Holanda: "NL", "França": "FR" };
const country = (s: string) => COUNTRY[s] ?? s.toLowerCase();

let seq = 0;
function ship(p: Partial<ShipmentRow> & { at: string; price?: number | null }): ShipmentRow {
  const { at, price, ...rest } = p;
  return {
    id: `s${++seq}`,
    created_at: at,
    order_type: "Bicycle",
    customer_name: "Mario Rossi",
    quantity: 1,
    destination_country: "Itália",
    customer_payment: 0,
    tracking_code: "TRK",
    selected_quote: price == null ? null : { portal: "MBE", carrier: "BRT", price },
    savings: 0,
    customer_cost_pickup: false,
    ticket_id: null,
    warranty_id: null,
    service_level: "standard",
    agent: "Luca",
    request_id: null,
    ...rest,
  };
}
const ticket = (p: Partial<TicketRow> & { at: string }): TicketRow => ({
  id: `t${++seq}`, created_at: p.at, brand: "Shimano", phase: "Ingresso", approval_status: null, completion_date: null, shipping_cost: 0, ...p,
});
const warranty = (p: Partial<WarrantyRow> & { at: string }): WarrantyRow => ({
  id: `w${++seq}`, created_at: p.at, start_date: null, process_type: "Garantia", status: "In attesa", solution: null, producer: "Columbus",
  value: null, shipping_cost: 0, history: [], updated_at: p.at, ...p,
});
const input = (p: Partial<ReportInput>): ReportInput => ({ shipments: [], tickets: [], warranties: [], requests: [], olderNames: [], ...p });

describe("helpers", () => {
  it("parses hand-written amounts", () => {
    expect(parseMoney("350.00")).toBe(350);
    expect(parseMoney("350,00")).toBe(350);
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("€ 1.200")).toBe(1200);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(80)).toBe(80);
  });
  it("normalizes customer names", () => {
    expect(normName("  José-Àlvarez ")).toBe("josealvarez");
    expect(normName("JOSE ALVAREZ")).toBe("josealvarez");
  });
  it("uses the Rome day", () => {
    expect(dayOf("2025-12-31T23:30:00Z")).toBe("2026-01-01");
    expect(dayOf("2026-03-04")).toBe("2026-03-04");
  });
  it("finds the completion date in the history", () => {
    const w = warranty({ at: "2026-01-01T10:00:00Z", status: "Completato", updated_at: "2026-05-01T10:00:00Z", history: [{ field: "status", newValue: "Completato", date: "2026-02-10T10:00:00Z" }] });
    expect(warrantyCompletion(w)).toBe("2026-02-10");
    expect(warrantyCompletion({ ...w, history: [] })).toBe("2026-05-01");
    expect(warrantyCompletion({ ...w, status: "In attesa" })).toBe("");
  });
});

describe("buildReport", () => {
  const data = input({
    shipments: [
      ship({ at: "2026-01-10T10:00:00Z", price: 100, customer_payment: 60, savings: 20, customer_name: "Mario Rossi" }),
      ship({ at: "2026-01-20T10:00:00Z", price: 50, customer_payment: 50, customer_name: "Nuovo Cliente", destination_country: "Holanda", service_level: "express", selected_quote: { portal: "My DHL", carrier: "DHL", price: 50 } }),
      ship({ at: "2026-06-01T10:00:00Z", price: null, customer_cost_pickup: true, customer_name: "mario  rossi", tracking_code: null, agent: null }),
      ship({ at: "2026-12-01T10:00:00Z", price: null, tracking_code: "", destination_country: null, customer_name: "Terzo" }),
      // anno precedente
      ship({ at: "2025-01-15T10:00:00Z", price: 40, customer_payment: 10, customer_name: "Mario Rossi" }),
      ship({ at: "2025-11-30T10:00:00Z", price: 60, customer_payment: 0, customer_name: "Altro" }),
    ],
    olderNames: [{ customer_name: "Terzo", created_at: "2023-05-05T10:00:00Z" }],
    tickets: [
      ticket({ at: "2026-01-01T10:00:00Z", phase: "Completato", approval_status: "Approvato", completion_date: "2026-01-11" }),
      ticket({ at: "2026-02-01T10:00:00Z", phase: "Completato", approval_status: "Rifiutato", completion_date: "2026-02-21", brand: "SRAM" }),
      ticket({ at: "2026-03-01T10:00:00Z", phase: "Completato" }),
    ],
    warranties: [
      warranty({ at: "2026-02-01T10:00:00Z", process_type: "A pagamento", value: "350,00", solution: "Pintura" }),
      warranty({ at: "2026-03-01T10:00:00Z", value: "1.000,00", status: "Completato", history: [{ field: "status", newValue: "Completato", date: "2026-03-31T10:00:00Z" }] }),
      warranty({ at: "2026-09-01T10:00:00Z", updated_at: "2026-09-02T10:00:00Z" }),
    ],
    requests: [
      { id: "r1", created_at: "2026-11-01T10:00:00Z", status: "shipped", service_level: "express", invoice_value: 1000, insured_value: 800, shipment_id: "rs1" },
      { id: "r2", created_at: "2026-11-02T10:00:00Z", status: "pending", service_level: "standard", invoice_value: "500", insured_value: null, shipment_id: null },
      { id: "r3", created_at: "2026-11-03T10:00:00Z", status: "cancelled", service_level: "express", invoice_value: 9999, insured_value: null, shipment_id: null },
    ],
    requestShipments: [{ id: "rs1", created_at: "2026-11-03T10:00:00Z" }],
  });

  const closed = buildReport(data, { year: 2026, today: "2027-01-15", country });
  const ytd = buildReport(data, { year: 2026, today: "2026-06-30", country });

  it("totals the year", () => {
    expect(closed.totals.shipments).toBe(4);
    expect(closed.totals.cost).toBe(150);
    expect(closed.totals.paid).toBe(110);
    expect(closed.totals.balance).toBe(-40);
    expect(closed.totals.savings).toBe(20);
    expect(closed.totals.priced).toBe(2);
    expect(closed.totals.customers).toBe(3);
    expect(closed.prev.cost).toBe(100);
    expect(closed.current).toBe(false);
    expect(closed.compare?.until).toBeNull();
  });

  it("compares the same period when the year is running", () => {
    expect(ytd.current).toBe(true);
    expect(ytd.compare?.until).toBe("2026-06-30");
    expect(ytd.compare?.now.shipments).toBe(3);
    expect(ytd.compare?.prev.shipments).toBe(1);
    expect(ytd.compare?.prev.cost).toBe(40);
  });

  it("splits by month, service, portal and country", () => {
    expect(closed.months[0].shipments).toBe(2);
    expect(closed.months[0].cost).toBe(150);
    expect(closed.months[0].prevCost).toBe(40);
    expect(closed.months[10].prevCost).toBe(60);
    expect(closed.service.express.n).toBe(1);
    expect(closed.service.standard.n).toBe(3);
    expect(closed.pickup).toBe(1);
    expect(closed.portals.map((p) => p.key)).toEqual(["MBE", "My DHL"]);
    expect(closed.carriers[0]).toMatchObject({ key: "BRT", n: 1, cost: 100 });
    expect(closed.savingsPct).toBeCloseTo(20 / 170);
    expect(closed.geo.italy.n).toBe(2);
    expect(closed.geo.abroad.n).toBe(1);
    expect(closed.geo.noCountry).toBe(1);
  });

  it("tells new customers from returning ones by normalized name", () => {
    // Mario Rossi (2025) e Terzo (2023) tornano; Nuovo Cliente è nuovo
    expect(closed.customers.active).toBe(3);
    expect(closed.customers.returning).toBe(2);
    expect(closed.customers.fresh).toBe(1);
    expect(closed.customers.byCount[0]).toMatchObject({ key: "mariorossi", n: 2 });
    expect(closed.customers.top10Share).toBe(1);
  });

  it("computes assistance figures", () => {
    expect(closed.tickets.count).toBe(3);
    expect(closed.tickets.approvalRate).toBe(0.5);
    expect(closed.tickets.avgDays).toBe(15);
    expect(closed.quality.ticketNoDate).toBe(1);
  });

  it("computes warranty figures", () => {
    const w = closed.warranties;
    expect(w.count).toBe(3);
    expect(w.paid).toBe(1);
    expect(w.covered).toBe(2);
    expect(w.valuePaid).toBe(350);
    expect(w.valueTotal).toBe(1350);
    expect(w.avgDays).toBe(30);
    expect(w.open).toBe(2);
    // ultima attività: 2026-02-01 e 2026-09-02, oggi 2027-01-15 → entrambi fermi
    expect(w.stalled).toBe(2);
    expect(closed.quality.warrantyNoValue).toBe(1);
  });

  it("computes shipping requests, leaving out cancelled ones", () => {
    const q = closed.requests;
    expect(q.count).toBe(3);
    expect(q.cancelled).toBe(1);
    expect(q.express).toBe(1);
    expect(q.invoiceTotal).toBe(1500);
    expect(q.insuredTotal).toBe(800);
    expect(q.withoutInsurance).toBe(1);
    expect(q.avgDaysToShip).toBeCloseTo(2);
  });

  it("counts data quality gaps, ignoring customer pickups", () => {
    expect(closed.quality.noCost).toBe(1);
    expect(closed.quality.noTracking).toBe(1);
    expect(closed.quality.noCountry).toBe(1);
    expect(closed.quality.noAgent).toBe(1);
  });

  it("handles an empty year", () => {
    const empty = buildReport(input({}), { year: 2026, today: "2026-06-30", country });
    expect(empty.totals.shipments).toBe(0);
    expect(empty.compare).toBeNull();
    expect(empty.tickets.avgDays).toBeNull();
    expect(empty.requests.avgDaysToShip).toBeNull();
    expect(buildInsights(empty)).toEqual([]);
  });
});

describe("buildInsights", () => {
  const many: ShipmentRow[] = [];
  for (let i = 0; i < 30; i++) {
    many.push(ship({ at: `2026-0${(i % 3) + 1}-1${i % 9}T10:00:00Z`, price: 20, customer_payment: 5, customer_name: `Cliente ${i % 12}`, destination_country: i % 4 === 0 ? "França" : "Itália", savings: 4 }));
  }
  for (let i = 0; i < 10; i++) many.push(ship({ at: `2025-02-0${(i % 9) + 1}T10:00:00Z`, price: 10, customer_name: "Vecchio" }));
  const r = buildReport(input({ shipments: many }), { year: 2026, today: "2027-02-01", country });
  const ins = buildInsights(r);
  const keys = ins.map((i) => i.key);

  it("derives sentences from the data", () => {
    expect(keys).toContain("rep.ins.ship.volumeUp");
    expect(keys).toContain("rep.ins.ship.avgCostUp");
    expect(ins.find((i) => i.key === "rep.ins.ship.avgCostUp")?.tone).toBe("watch");
    expect(ins.find((i) => i.key === "rep.ins.ship.recovery")?.tone).toBe("watch");
    expect(keys).toContain("rep.ins.carr.savings");
    expect(keys).toContain("rep.ins.geo.italy");
    expect(keys).toContain("rep.ins.cli.new");
    // 8 spedizioni su 30 vanno in Francia
    expect(ins.find((i) => i.key === "rep.ins.geo.italy")?.vars.pct).toEqual({ pct: 22 / 30 });
  });

  it("has a translation for every insight key in both languages", () => {
    for (const k of keys) {
      expect(reportResources.it[k], k).toBeTruthy();
      expect(reportResources.pt[k], k).toBeTruthy();
    }
  });
});

describe("i18n", () => {
  it("has the same keys in Italian and Portuguese", () => {
    expect(Object.keys(reportResources.pt).sort()).toEqual(Object.keys(reportResources.it).sort());
  });
  it("covers every insight key the code can produce", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./compute.ts", import.meta.url), "utf8");
    const literal = Array.from(src.matchAll(/"(rep\.ins\.[a-zA-Z.]+)"/g), (m) => m[1]);
    for (const k of literal) expect(reportResources.it[k], k).toBeTruthy();
  });
});

describe("saldo per cliente", () => {
  const ship = (name: string, price: number | null, paid: number | null, agent: string | null = null): ShipmentRow => ({
    id: Math.random().toString(36), created_at: "2026-03-10T10:00:00Z", order_type: "Bicycle", customer_name: name, quantity: 1,
    destination_country: "Itália", customer_payment: paid, tracking_code: "x", selected_quote: price == null ? null : { portal: "MBE", carrier: "DHL", price },
    savings: 0, customer_cost_pickup: price == null, ticket_id: null, warranty_id: null, service_level: "standard", agent,
  } as ShipmentRow);

  it("pagato − costo, senza pagamento e agente più frequente", () => {
    const rows = [
      ship("Bike Point", 50, 80, "Michele"), ship("BIKE POINT", 40, 60, "Michele"),
      ship("Rossi", 100, 0, "Emanuele"), ship("Rossi", 60, 20), ship("Ritiro", null, null),
    ];
    const list = customerBalances(rows, (s) => s.customer_name ?? "", (s) => normName(s.customer_name));
    const byName = Object.fromEntries(list.map((b) => [b.key, b]));
    expect(byName[normName("Bike Point")]).toMatchObject({ n: 2, cost: 90, paid: 140, balance: 50, unpaid: 0, agent: "Michele" });
    expect(byName[normName("Rossi")]).toMatchObject({ n: 2, cost: 160, paid: 20, balance: -140, unpaid: 1, agent: "Emanuele" });
    expect(byName[normName("Ritiro")]).toMatchObject({ cost: 0, paid: 0, balance: 0 });
  });
});

describe("quota dei 10 peggiori", () => {
  it("è positiva anche con saldi negativi", () => {
    const base = { created_at: "2026-03-10T10:00:00Z", order_type: "Bicycle", quantity: 1, destination_country: "Itália", tracking_code: "x", savings: 0, customer_cost_pickup: false, ticket_id: null, warranty_id: null, service_level: "standard", agent: null };
    const shipments = Array.from({ length: 12 }, (_, i) => ({ ...base, id: `s${i}`, customer_name: `Cliente ${i}`, customer_payment: 0, selected_quote: { portal: "MBE", carrier: "DHL", price: i === 0 ? 1000 : 10 } })) as ShipmentRow[];
    const input = { shipments, prevShipments: [], olderNames: [], tickets: [], warranties: [], requests: [] } as unknown as ReportInput;
    const r = buildReport(input, { year: 2026, today: "2026-11-16", country });
    expect(r.balance.inLoss).toBe(12);
    expect(r.balance.worst10Share).toBeCloseTo((1000 + 9 * 10) / 1110, 5);
  });
});

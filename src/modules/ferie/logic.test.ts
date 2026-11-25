import { describe, expect, it } from "vitest";
import {
  absences, blockingEvent, conflictsFor, sectorConflictDays, validateLeave, vanClashes, workingDays,
  type AgendaEvent, type Employee, type Leave,
} from "./logic";

const ana: Employee = { id: "a", name: "Ana", primary_sector: "officina", secondary_sector: null };
const bea: Employee = { id: "b", name: "Bea", primary_sector: "magazzino", secondary_sector: "officina" };
const caio: Employee = { id: "c", name: "Caio", primary_sector: "marketing", secondary_sector: null };
const dani: Employee = { id: "d", name: "Dani", primary_sector: "officina", secondary_sector: null };
const team = [ana, bea, caio, dani];

const leave = (id: string, employee_id: string, start_date: string, end_date: string, status: Leave["status"] = "approved"): Leave =>
  ({ id, employee_id, start_date, end_date, part: "full", status });
const ev = (over: Partial<AgendaEvent>): AgendaEvent =>
  ({ id: "e", kind: "block", title: "x", start_date: "2026-12-01", end_date: "2026-12-01", sector: null, employee_ids: [], ...over });

describe("conflitos", () => {
  // segunda 7/12 a sexta 11/12/2026
  const leaves = [
    leave("1", "a", "2026-12-07", "2026-12-11"),
    leave("2", "b", "2026-12-10", "2026-12-14", "pending"),
    leave("3", "c", "2026-12-07", "2026-12-11"),
    leave("4", "d", "2026-12-07", "2026-12-08", "rejected"),
  ];
  const all = absences(leaves, []);

  it("acha quem divide o setor, inclusive pelo secundário", () => {
    const c = conflictsFor(ana, "2026-12-07", "2026-12-11", team, all, "1");
    expect(c.map((x) => x.employee.name)).toEqual(["Bea"]);
    expect(c[0].sector).toBe("officina");
    expect(c[0].viaSecondary).toBe(true);
  });

  it("ignora outros setores e pedidos negados", () => {
    const c = conflictsFor(dani, "2026-12-07", "2026-12-08", team, all);
    expect(c.map((x) => x.employee.name)).toEqual(["Ana"]);
    expect(c[0].viaSecondary).toBe(false);
  });

  it("marca os dias úteis com duas pessoas fora no setor", () => {
    const days = sectorConflictDays(team, all, "2026-12-01", "2026-12-31");
    expect([...(days.get("officina") ?? [])].sort()).toEqual(["2026-12-10", "2026-12-11"]);
    expect(days.has("marketing")).toBe(false);
    expect(days.has("magazzino")).toBe(false);
  });

  it("viagem de trabalho também deixa a pessoa fora", () => {
    const withTrip = absences([leave("1", "a", "2026-12-07", "2026-12-07")], [ev({ id: "t", kind: "travel", start_date: "2026-12-07", end_date: "2026-12-07", employee_ids: ["d"] })]);
    expect(conflictsFor(ana, "2026-12-07", "2026-12-07", team, withTrip, "1").map((x) => x.source)).toEqual(["event"]);
  });
});

describe("bloqueios e furgões", () => {
  it("bloqueio da empresa ou do setor da pessoa", () => {
    const events = [ev({ id: "m", sector: "marketing", start_date: "2026-12-09", end_date: "2026-12-09" })];
    expect(blockingEvent(ana, "2026-12-07", "2026-12-11", events)).toBeUndefined();
    expect(blockingEvent(caio, "2026-12-07", "2026-12-11", events)?.id).toBe("m");
    expect(blockingEvent(ana, "2026-12-07", "2026-12-11", [ev({ start_date: "2026-12-11", end_date: "2026-12-11" })])).toBeDefined();
  });

  it("duas reservas no mesmo furgão", () => {
    const v = (id: string, van_id: string, s: string, e: string) => ev({ id, kind: "van", van_id, start_date: s, end_date: e });
    const clash = vanClashes([v("1", "x", "2026-12-01", "2026-12-02"), v("2", "x", "2026-12-02", "2026-12-03"), v("3", "y", "2026-12-01", "2026-12-03")]);
    expect([...clash].sort()).toEqual(["1", "2"]);
  });
});

describe("pedido", () => {
  it("conta dias úteis e meio dia", () => {
    expect(workingDays({ start_date: "2026-12-07", end_date: "2026-12-13", part: "full" })).toBe(5);
    expect(workingDays({ start_date: "2026-12-07", end_date: "2026-12-07", part: "am" })).toBe(0.5);
  });

  it("valida as datas", () => {
    const today = "2026-11-25";
    expect(validateLeave({ start_date: "", end_date: "", part: "full" }, today)).toBe("fe.err.dates");
    expect(validateLeave({ start_date: "2026-12-05", end_date: "2026-12-01", part: "full" }, today)).toBe("fe.err.order");
    expect(validateLeave({ start_date: "2026-11-20", end_date: "2026-11-21", part: "full" }, today)).toBe("fe.err.past");
    expect(validateLeave({ start_date: "2026-12-01", end_date: "2026-12-02", part: "am" }, today)).toBe("fe.err.half");
    expect(validateLeave({ start_date: "2026-12-01", end_date: "2026-12-01", part: "pm" }, today)).toBeNull();
  });
});

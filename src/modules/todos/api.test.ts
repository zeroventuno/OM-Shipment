import { describe, expect, it } from "vitest";
import { autoItems } from "./api";

describe("itens automáticos do To Do", () => {
  it("pega só o que está pendente e ordena as paradas pelos dias", () => {
    const items = autoItems({
      requests: [
        { id: "1", status: "pending", customer: { name: "Bici Shop" }, order_ref: "SO-1", requested_by: "Ana" },
        { id: "2", status: "shipped", customer: { name: "Já foi" }, order_ref: null, requested_by: "Ana" },
      ] as never,
      pickups: [{ id: "p", status: "new", shop_name: "Velo NL", code: "OMP-26-001", city: "Utrecht" }, { id: "q", status: "converted", shop_name: "x" }] as never,
      tickets: [{ item: { id: "t1", code: "OMA-26-001", clientName: "Rossi", component: "Ruota", phase: "Inviato" }, days: 40 },
        { item: { id: "t2", code: "OMA-26-002", clientName: "Bianchi", component: "Telaio", phase: "Inviato" }, days: 90 }] as never,
      leaves: [{ id: "l", employee_id: "e", status: "pending", start_date: "2026-12-01", end_date: "2026-12-03" }, { id: "m", employee_id: "e", status: "approved", start_date: "2026-12-05", end_date: "2026-12-05" }] as never,
      employees: [{ id: "e", name: "Marco" }] as never,
    });
    expect(items.map((i) => i.key)).toEqual(["r1", "pp", "tt2", "tt1", "ll"]);
    expect(items.find((i) => i.kind === "pickup")?.sub).toBe("OMP-26-001 · Utrecht");
    expect(items.find((i) => i.kind === "leave")?.title).toBe("Marco");
    expect(items.find((i) => i.key === "tt2")?.to).toBe("/assistance/t2");
  });
});

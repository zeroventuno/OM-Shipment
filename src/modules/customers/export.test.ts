import { describe, it, expect } from "vitest";
import { buildCustomersCsv, type CustomerRow } from "./api";
import { parseSpreadsheet } from "./spreadsheet.js";
import { normalizeRow, groupRows, planImport, addressKey } from "./importer.js";

const base: CustomerRow = {
  id: "c1", name: "Bike Point; Milano", address_line1: "Via Roma 1", address_line2: null, address_line3: null, postal_code: "20100",
  city: "Milano", region: "MI", country: "Itália", contact_name: "Anna", phone: "+39021234", email: "a@b.it", tax_id: "IT123",
  notes: null, source: "app", created_at: "2026-01-01", updated_at: "2026-01-01", addresses: 2, shipments: 3,
  first_shipment: null, last_shipment: "2026-05-02T10:00:00Z", freight_cost: 50, tickets: 0, warranties: 1, requests: 0,
};

describe("exportação CSV", () => {
  const addresses = [
    { id: "a1", customer_id: "c1", label: "Negozio", address_line1: "Via Roma 1", postal_code: "20100", city: "Milano", region: "MI", country: "Itália", contact_name: "Anna", phone: "+39021234", is_default: true },
    { id: "a2", customer_id: "c1", label: null, address_line1: 'Magazzino "Nord", 5', postal_code: "20090", city: "Segrate", region: null, country: "Itália", contact_name: null, phone: null, is_default: false },
  ] as never[];
  const csv = buildCustomersCsv([base], addresses, () => "Italia");

  it("uma linha por endereço, com aspas e ponto e vírgula escapados", () => {
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('"Bike Point; Milano";Anna')).toBe(true);
    expect(lines[2]).toContain('"Magazzino ""Nord"", 5"');
  });

  it("o arquivo exportado volta pelo importador sem criar nada repetido", async () => {
    const rows = (await parseSpreadsheet(new TextEncoder().encode(csv))) as Record<string, string>[];
    const groups = groupRows(rows.map(normalizeRow));
    expect(groups).toHaveLength(1);
    expect(groups[0].addresses.map((a: { city: string }) => a.city).sort()).toEqual(["Milano", "Segrate"]);
    expect(groups[0].tax_id).toBe("IT123");
    const known = addresses.map((a: { customer_id: string }) => ({ customer_id: a.customer_id, key: addressKey(a) as string }));
    const plan = planImport(groups, [base], known, { source: "csv:x" });
    expect(plan.newCustomers).toHaveLength(0);
    expect(plan.newAddresses).toHaveLength(0);
  });
});

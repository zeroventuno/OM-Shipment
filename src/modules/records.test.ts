import { describe, it, expect } from "vitest";
import { fromRow, toRow, emptyToNull, diffHistory, createdEntry } from "./records";

describe("fromRow / toRow", () => {
    it("converte snake_case em camelCase e datas em Date", () => {
        const t = fromRow<{ clientName: string; createdAt: Date; shippingDate: null }>(
            { client_name: "Mario", created_at: "2026-01-04T10:00:00+00:00", shipping_date: null },
            ["createdAt", "shippingDate"],
        );
        expect(t.clientName).toBe("Mario");
        expect(t.createdAt).toBeInstanceOf(Date);
        expect(t.createdAt.toISOString()).toBe("2026-01-04T10:00:00.000Z");
        expect(t.shippingDate).toBeNull();
    });

    it("converte camelCase em snake_case e ignora undefined", () => {
        expect(toRow({ clientName: "Mario", serialNumber: undefined, shippingDate: new Date("2026-02-01T00:00:00Z") }))
            .toEqual({ client_name: "Mario", shipping_date: "2026-02-01T00:00:00.000Z" });
    });

    it("troca string vazia por null só nos campos indicados", () => {
        expect(emptyToNull({ a: "", b: "", c: "x" }, ["a"])).toEqual({ a: null, b: "", c: "x" });
    });
});

describe("diffHistory", () => {
    const now = new Date("2026-03-01T12:00:00Z");

    it("registra só os campos que mudaram", () => {
        const entries = diffHistory(
            { clientName: "Mario", phase: "Ingresso", serialNumber: null },
            { clientName: "Mario", phase: "Spedito", serialNumber: "" },
            [],
            now,
        );
        expect(entries).toEqual([
            { field: "phase", oldValue: "Ingresso", newValue: "Spedito", date: now.toISOString(), action: "updated" },
        ]);
    });

    it("compara datas só pelo dia", () => {
        const entries = diffHistory(
            { shippingDate: new Date("2026-02-01T00:00:00Z") },
            { shippingDate: "2026-02-01" },
            ["shippingDate"],
            now,
        );
        expect(entries).toEqual([]);
    });

    it("detecta data nova", () => {
        const [entry] = diffHistory({ completionDate: null }, { completionDate: "2026-02-03" }, ["completionDate"], now);
        expect(entry).toMatchObject({ field: "completionDate", oldValue: "-", newValue: "2026-02-03" });
    });

    it("cria a entrada inicial", () => {
        expect(createdEntry("Ticket", now)).toEqual({
            field: "Ticket", oldValue: null, newValue: "Creato", date: now.toISOString(), action: "created",
        });
    });
});

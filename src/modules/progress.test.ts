import { describe, it, expect } from "vitest";
import { lastStageChange, daysSince, stageAge } from "./progress";
import type { HistoryEntry } from "./schema";

const entry = (field: string, date: string, action: HistoryEntry["action"] = "updated"): HistoryEntry =>
    ({ field, oldValue: "a", newValue: "b", date, action });

describe("lastStageChange", () => {
    it("usa a última mudança do campo de etapa", () => {
        const h = [
            entry("Ticket", "2026-01-01T00:00:00Z", "created"),
            entry("phase", "2026-02-01T00:00:00Z"),
            entry("brand", "2026-04-01T00:00:00Z"),
            entry("phase", "2026-03-01T00:00:00Z"),
        ];
        expect(lastStageChange(h, ["phase", "Fase"], "2026-01-01T00:00:00Z").toISOString()).toBe("2026-03-01T00:00:00.000Z");
    });

    it("reconhece o rótulo antigo em italiano", () => {
        const h = [entry("Stato", "2026-05-10T00:00:00Z")];
        expect(lastStageChange(h, ["status", "Stato"], "2026-05-01T00:00:00Z").toISOString()).toBe("2026-05-10T00:00:00.000Z");
    });

    it("sem mudança, usa a data de abertura", () => {
        expect(lastStageChange(null, ["status"], "2026-05-01T00:00:00Z").toISOString()).toBe("2026-05-01T00:00:00.000Z");
    });
});

describe("stageAge", () => {
    const now = new Date("2026-06-15T12:00:00Z");

    it("conta os dias e marca atraso depois de 30", () => {
        expect(daysSince(new Date("2026-06-14T13:00:00Z"), now)).toBe(0);
        expect(stageAge(null, ["status"], "2026-05-01T00:00:00Z", false, now)).toMatchObject({ days: 45, stale: true });
        expect(stageAge(null, ["status"], "2026-06-01T00:00:00Z", false, now)).toMatchObject({ days: 14, stale: false });
    });

    it("processo concluído nunca é atrasado", () => {
        expect(stageAge(null, ["status"], "2026-01-01T00:00:00Z", true, now).stale).toBe(false);
    });
});

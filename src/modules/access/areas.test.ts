import { describe, expect, it } from "vitest";
import { areaForPath, firstAllowedPath, isAreaOn } from "./areas";

describe("áreas por login", () => {
  it("o que não está desligado fica ligado", () => {
    expect(isAreaOn({ areas: {} }, "assistenza")).toBe(true);
    expect(isAreaOn({ areas: { assistenza: false } }, "assistenza")).toBe(false);
    expect(isAreaOn(undefined, "clienti")).toBe(true);
  });
  it("acha a área pelo endereço", () => {
    expect(areaForPath("/shipments/new")).toBe("spedizioni");
    expect(areaForPath("/customers/duplicates")).toBe("clienti");
    expect(areaForPath("/service-requests")).toBe("richieste");
    expect(areaForPath("/ferie")).toBeNull();
  });
  it("manda para a primeira área ligada", () => {
    expect(firstAllowedPath({ admin: false, ferie: "none", areas: {} })).toBe("/shipments");
    expect(firstAllowedPath({ admin: false, ferie: "none", areas: { spedizioni: false } })).toBe("/assistance");
    const allOff = { spedizioni: false, assistenza: false, garanzie: false, richieste: false, clienti: false, referenti: false };
    expect(firstAllowedPath({ admin: false, ferie: "view", areas: allOff })).toBe("/ferie");
    expect(firstAllowedPath({ admin: false, ferie: "none", areas: allOff })).toBe("/no-access");
  });
});

import { describe, it, expect } from "vitest";
import { parseMoney, formatMoney } from "./api";

describe("parseMoney", () => {
  it("aceita os formatos que a equipe digita", () => {
    expect(parseMoney("1250,50")).toBe(1250.5);
    expect(parseMoney("1.250,50")).toBe(1250.5);
    expect(parseMoney("1,250.50")).toBe(1250.5);
    expect(parseMoney("1.250")).toBe(1250);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("€ 980")).toBe(980);
    expect(parseMoney("0")).toBe(0);
  });

  it("recusa vazio, negativo e texto", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("formata em euro", () => {
    expect(formatMoney(12500.5, "it")).toMatch(/12\.500,50/);
    expect(formatMoney(null)).toBe("");
  });
});

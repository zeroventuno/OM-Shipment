import { describe, expect, it } from "vitest";
import { chargeableWeight, priceFor, quoteCard, type RateCardData, type Service } from "./calc";

// Pedaços reais dos listini (FedEx IP Mondo zona A; DHL Worldwide zona 1)
const fedex: Service = {
  code: "IP", name: "FedEx International Priority", region: "world", direction: "export", zones: ["A"],
  steps: [
    { upTo: 10, prices: { A: 71.87 } },
    { upTo: 10.5, prices: { A: 75.23 } },
    { upTo: 21, prices: { A: 145.53 }, addStep: 0.5, addPrices: { A: 3.36 } },
  ],
  perKg: [{ from: 71, to: 99, prices: { A: 7.56 } }, { from: 100, to: 299, prices: { A: 7.48 } }],
};
const dhl: Service = {
  code: "WPX", name: "DHL Express Worldwide", region: "world", direction: "export", zones: ["1"], zoning: "express",
  steps: [
    { upTo: 10, prices: { 1: 40.66 } }, { upTo: 11, prices: { 1: 43.22 } },
    { upTo: 30, prices: { 1: 90.66 } }, { upTo: 40, prices: { 1: 109.76 } }, { upTo: 70, prices: { 1: 167.06 } },
  ],
  perKg: [],
  extra: [
    { from: 10, to: 20, step: 0.5, prices: { 1: 1.28 } },
    { from: 30, to: 70, step: 1, prices: { 1: 1.91 } },
    { from: 70, to: 300, step: 1, prices: { 1: 3.28 } },
    { from: 300, to: null, step: 1, prices: { 1: 3.28 } },
  ],
};

describe("listini: conta do preço", () => {
  it("peso cobrado: maior entre real e volumétrico, colo por colo, para cima em 0,5", () => {
    expect(chargeableWeight([{ weight: 25, length: 120, width: 30, height: 80 }], 5000)).toBe(58); // 57,6 vol.
    expect(chargeableWeight([{ weight: 3.2 }], 5000)).toBe(3.5);
    expect(chargeableWeight([{ weight: 10, length: 40, width: 30, height: 20, qty: 2 }], 5000)).toBe(20);
  });

  it("FedEx: faixa exata, degrau de +0,5 kg e preço por kg acima de 70,5", () => {
    expect(priceFor(fedex, "A", 10.5)?.price).toBe(75.23);
    expect(priceFor(fedex, "A", 15)?.price).toBe(105.47); // 75,23 + 9 × 3,36
    expect(priceFor(fedex, "A", 21)?.price).toBe(145.53);
    expect(priceFor(fedex, "A", 80)).toMatchObject({ price: 604.8, perKg: true, chargeable: 80 });
    expect(priceFor(fedex, "B", 5)).toBeNull();
  });

  it("DHL: supplemento por meio kg, por kg entre faixas e acima de 70", () => {
    expect(priceFor(dhl, "1", 10.5)?.price).toBe(41.94); // 40,66 + 1,28
    expect(priceFor(dhl, "1", 11)?.price).toBe(43.22);
    expect(priceFor(dhl, "1", 35)?.price).toBe(100.21); // 90,66 + 5 × 1,91
    expect(priceFor(dhl, "1", 75)?.price).toBe(183.46); // 167,06 + 5 × 3,28
  });

  it("opções de um listino para um país, da mais barata à mais cara, pelo zonário de cada serviço", () => {
    const card: RateCardData = {
      carrier: "Teste", currency: "EUR", validFrom: null, volumetricDivisor: 5000, roundTo: 0.5,
      zoning: { default: { export: { US: "A" } }, express: { export: { US: "1" } } },
      services: [fedex, dhl],
    };
    const q = quoteCard(card, "us", "export", [{ weight: 10.5 }]);
    expect(q.map((x) => [x.service, x.zone, x.price])).toEqual([["WPX", "1", 41.94], ["IP", "A", 75.23]]);
    expect(quoteCard(card, "BR", "export", [{ weight: 2 }])).toEqual([]);
  });
});

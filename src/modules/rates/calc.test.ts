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

describe("listino a pacchi tipo (My Parcel)", () => {
  const card: RateCardData = {
    carrier: "My Parcel", currency: "EUR", validFrom: null, volumetricDivisor: 5000, roundTo: 0.5, zoning: {}, services: [],
    presets: [
      { key: "bici", label: "Bici", weight: 10, length: 120, width: 35, height: 80, prices: { DE: { price: 99.05, service: "DHL Economy" } } },
      { key: "ruote", label: "Ruote", weight: 4, length: 69, width: 30, height: 71, prices: { DE: { price: 29.89, service: "UPS Standard" } } },
      { key: "piccoli", label: "Articoli piccoli", weight: 1, length: 25, width: 20, height: 10, prices: { DE: { price: 12.62, service: "DHL Economy" } } },
    ],
  };
  it("usa o menor pacote tipo que comporta cada colo e soma", () => {
    expect(quoteCard(card, "DE", "export", [{ weight: 0.8 }])[0]).toMatchObject({ price: 12.62, preset: "Articoli piccoli" });
    expect(quoteCard(card, "DE", "export", [{ weight: 25, length: 120, width: 30, height: 80 }])[0]).toMatchObject({ price: 99.05, preset: "Bici" });
    expect(quoteCard(card, "DE", "export", [{ weight: 1, qty: 2 }, { weight: 20 }])[0]).toMatchObject({ price: 55.13 });
  });
  it("sem preço para o país, peso acima do maior pacote ou import: nada", () => {
    expect(quoteCard(card, "FR", "export", [{ weight: 1 }])).toEqual([]);
    expect(quoteCard(card, "DE", "export", [{ weight: 90 }])).toEqual([]);
    expect(quoteCard(card, "DE", "import", [{ weight: 1 }])).toEqual([]);
  });
});

describe("regras por serviço (BRT)", () => {
  const smart: Service = {
    code: "SE1", name: "Smart 1 collo", region: "europe", direction: "export", zones: ["A"], zoning: "s",
    volumetricDivisor: 0, roundTo: 1, maxParcels: 1, maxParcelKg: 31.5, maxParcelM3: 0.25, perKg: [],
    steps: [{ upTo: 10, prices: { A: 11.95 } }, { upTo: 31.5, prices: { A: 22.05 } }],
  };
  const road: Service = {
    code: "EX", name: "Euroexpress", region: "europe", direction: "export", zones: ["DE"], zoning: "e",
    volumetricDivisor: 4000, roundTo: 1,
    steps: [{ upTo: 75, prices: { DE: 60.6 } }, { upTo: 100, prices: { DE: 75.7 } }],
    perKg: [{ from: 101, to: null, prices: { DE: 0.672 } }],
  };
  const card: RateCardData = {
    carrier: "BRT", currency: "EUR", validFrom: null, volumetricDivisor: 4000, roundTo: 1,
    zoning: { s: { export: { DE: "A" } }, e: { export: { DE: "DE" } } }, services: [smart, road],
  };
  it("limites de colli, peso e volume; divisor do próprio serviço", () => {
    // scatola bici 0,288 m³: fora do Smart; na estrada 120×30×80 ÷ 4000 = 72 kg
    expect(quoteCard(card, "DE", "export", [{ weight: 25, length: 120, width: 30, height: 80 }]).map((q) => [q.service, q.chargeable, q.price])).toEqual([["EX", 72, 60.6]]);
    expect(quoteCard(card, "DE", "export", [{ weight: 5, length: 40, width: 30, height: 20 }])[0]).toMatchObject({ service: "SE1", price: 11.95 });
    expect(quoteCard(card, "DE", "export", [{ weight: 5, qty: 2 }]).map((q) => q.service)).toEqual(["EX"]);
  });
  it("a quintale: nunca abaixo da última faixa", () => {
    expect(priceFor(road, "DE", 101)?.price).toBe(75.7);
    expect(priceFor(road, "DE", 150)?.price).toBe(100.8);
  });
});

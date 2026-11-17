import { describe, expect, it } from "vitest";
import { sameAgent, quoteCarrier, trackingUrl } from "./api";

describe("sameAgent", () => {
  it("ignora acento, maiúsculas e sobrenome quando um lado é só o primeiro nome", () => {
    expect(sameAgent("Érica", "Erica pedratscher")).toBe(true);
    expect(sameAgent("samuele", "Samuele")).toBe(true);
    expect(sameAgent(" Erica  Pedratscher ", "erica pedratscher")).toBe(true);
  });
  it("não confunde pessoas diferentes", () => {
    expect(sameAgent("Erica Rossi", "Erica Pedratscher")).toBe(false);
    expect(sameAgent("Samuele", "Emanuele")).toBe(false);
    expect(sameAgent("", "Samuele")).toBe(false);
  });
});

describe("quoteCarrier / trackingUrl", () => {
  it("monta portal / transportadora e o link TNT Itália", () => {
    expect(quoteCarrier({ portal: "My Parcel", carrier: "TNT" })).toBe("My Parcel / TNT");
    expect(quoteCarrier(null)).toBeNull();
    expect(trackingUrl("TNT", "WS 03014887")).toBe("https://www.tnt.it/tracking/getTrack.html?wt=1&consigNos=WS03014887");
  });
});

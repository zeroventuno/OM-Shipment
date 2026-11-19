import { describe, expect, it } from "vitest";
import { PICKUP_LANGUAGE_KEYS, pickupText } from "./i18n";
import { boxValid, emptyPickup, pickupPayload, toNumber, validatePickup, type PickupDraft } from "./intake";

const today = new Date(2026, 10, 19);
const ok: PickupDraft = {
  ...emptyPickup, reason: "warranty", shop_name: "Bike Shop NL", contact_name: "Jan", email: "jan@shop.nl",
  phone: "+31 20 000", address_line1: "Straat 1", postal_code: "1011", city: "Amsterdam", country: "Holanda",
  ready_from: "2026-11-20", description: "1 bici completa in scatola", privacy_accepted: true,
};

describe("pedido de retirada de parceiros externos", () => {
  it("aceita um pedido completo, com ou sem caixas", () => {
    expect(validatePickup(ok, today)).toBeNull();
    expect(validatePickup({ ...ok, boxes: [{ width: "120", height: "35", depth: "80", weight: "12,5" }] }, today)).toBeNull();
  });
  it("exige motivo, dados obrigatórios, e-mail, data e privacidade", () => {
    expect(validatePickup({ ...ok, reason: "" }, today)).toBe("err.reason");
    expect(validatePickup({ ...ok, city: " " }, today)).toBe("err.required");
    expect(validatePickup({ ...ok, email: "jan" }, today)).toBe("err.email");
    expect(validatePickup({ ...ok, ready_from: "2026-11-18" }, today)).toBe("err.date");
    expect(validatePickup({ ...ok, privacy_accepted: false }, today)).toBe("err.privacy");
  });
  it("caixa precisa de medidas e peso plausíveis", () => {
    expect(boxValid({ width: "120", height: "35", depth: "80", weight: "0,5" })).toBe(true);
    expect(boxValid({ width: "", height: "35", depth: "80", weight: "10" })).toBe(false);
    expect(boxValid({ width: "900", height: "35", depth: "80", weight: "10" })).toBe(false);
    expect(validatePickup({ ...ok, boxes: [{ width: "1", height: "", depth: "", weight: "" }] }, today)).toBe("err.box");
  });
  it("converte vírgula decimal e manda o idioma", () => {
    expect(toNumber("12,5")).toBe(12.5);
    const p = pickupPayload({ ...ok, email: " jan@shop.nl ", boxes: [{ width: "120", height: "35", depth: "80", weight: "12,5" }] }, "en");
    expect(p).toMatchObject({ email: "jan@shop.nl", language: "en", boxes: [{ width: 120, height: 35, depth: 80, weight: 12.5 }] });
  });
  it("todos os idiomas têm as mesmas chaves", () => {
    for (const lang of PICKUP_LANGUAGE_KEYS) expect(Object.keys(pickupText[lang]).sort()).toEqual(Object.keys(pickupText.it).sort());
  });
});

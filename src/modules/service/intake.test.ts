import { describe, expect, it } from "vitest";
import { PUBLIC_LANGUAGES, publicText } from "./i18n";
import { emptyDraft, fileMime, requestNotes, ticketPrefill, validateDraft, warrantyPrefill, type ServiceDraft } from "./intake";

describe("textos do formulário público", () => {
  it("todos os idiomas têm as mesmas chaves", () => {
    const keys = Object.keys(publicText.it).sort();
    for (const lang of PUBLIC_LANGUAGES) expect(Object.keys(publicText[lang]).sort()).toEqual(keys);
  });
});

const warranty: ServiceDraft = {
  ...emptyDraft, kind: "warranty", product: "L8", serial_number: "S1", problem: "Crepa",
  customer_name: "Ana", email: "ana@example.com", privacy_accepted: true,
};
const request = {
  code: "OMR-26-001", customer_name: "Ana", email: "ana@example.com", phone: "+39 1", country: "Italia",
  shop: "Bici Roma", purchase_date: "2026-03-09", brand: "SRAM", product: "Red", size: "M", serial_number: null, problem: "Non cambia",
};

describe("pedido público de garantia/assistência", () => {
  it("aceita garantia completa", () => expect(validateDraft(warranty)).toBeNull());
  it("garantia exige número de série; assistência exige marca", () => {
    expect(validateDraft({ ...warranty, serial_number: " " })).toBe("err.serial");
    expect(validateDraft({ ...warranty, kind: "assistance", serial_number: "" })).toBe("err.brand");
    expect(validateDraft({ ...warranty, kind: "assistance", serial_number: "", brand: "Shimano" })).toBeNull();
  });
  it("exige tipo, e-mail válido e aviso de privacidade", () => {
    expect(validateDraft({ ...warranty, kind: "" })).toBe("err.kind");
    expect(validateDraft({ ...warranty, email: "ana" })).toBe("err.email");
    expect(validateDraft({ ...warranty, privacy_accepted: false })).toBe("err.privacy");
  });
  it("reconhece HEIC sem tipo e só aceita PDF no comprovante", () => {
    expect(fileMime({ name: "IMG.HEIC", type: "" }, false)).toBe("image/heic");
    expect(fileMime({ name: "a.pdf", type: "application/pdf" }, false)).toBeNull();
    expect(fileMime({ name: "a.pdf", type: "application/pdf" }, true)).toBe("application/pdf");
    expect(fileMime({ name: "a.svg", type: "image/svg+xml" }, true)).toBeNull();
  });
  it("leva contato e compra para o processo interno", () => {
    expect(requestNotes(request)).toContain("Data acquisto: 09/03/2026");
    expect(ticketPrefill(request)).toMatchObject({ component: "Red", brand: "SRAM", serialNumber: "" });
    expect(ticketPrefill(request).problem).toContain("Telefono: +39 1");
    expect(warrantyPrefill(request)).toMatchObject({ bikeModel: "Red", size: "M", problem: "Non cambia" });
    expect(warrantyPrefill(request).observation).toContain("Bici Roma");
  });
});

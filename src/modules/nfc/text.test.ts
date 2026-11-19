import { describe, expect, it } from "vitest";
import { NFC_LANGUAGES, isTagCode, nfcLanguage, nfcText, publicOrigin, splitName, telHref } from "./text";

describe("chips NFC", () => {
  it("só aceita códigos de 8 caracteres base62", () => {
    expect(isTagCode("a7K2pQ9x")).toBe(true);
    expect(isTagCode("a7K2pQ9")).toBe(false);
    expect(isTagCode("a7K2pQ9x/")).toBe(false);
    expect(isTagCode(undefined)).toBe(false);
  });
  it("monta o link de ligar com o número limpo", () => {
    expect(telHref("+39 333 12 34 567")).toBe("tel:+393331234567");
    expect(telHref("0039 333 1234567")).toBe("tel:+393331234567");
    expect(telHref("333-1234567")).toBe("tel:3331234567");
    expect(telHref("  ")).toBe("");
  });
  it("chip gravado numa prévia aponta para produção", () => {
    expect(publicOrigin("https://om-shipment-git-melhorias-x.vercel.app")).toBe("https://om-shipment.vercel.app");
    expect(publicOrigin("https://om-shipment.vercel.app")).toBe("https://om-shipment.vercel.app");
    expect(publicOrigin("https://servizio.example.it")).toBe("https://servizio.example.it");
  });
  it("idioma do navegador, senão inglês; textos com as mesmas chaves", () => {
    expect(nfcLanguage(["it-IT"])).toBe("it");
    expect(nfcLanguage(["de-DE", "en-GB"])).toBe("en");
    expect(nfcLanguage(["pt-BR"])).toBe("pt");
    expect(nfcLanguage(["ja", "es-AR"])).toBe("es");
    expect(nfcLanguage(["ja"])).toBe("en");
    for (const l of NFC_LANGUAGES) expect(Object.keys(nfcText[l]).sort()).toEqual(Object.keys(nfcText.it).sort());
  });
  it("separa o sobrenome do nome", () => {
    expect(splitName("  Cristiano   Cunha ")).toEqual(["Cristiano", "Cunha"]);
    expect(splitName("Ana")).toEqual(["Ana", ""]);
  });
});

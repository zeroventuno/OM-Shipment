import { describe, expect, it } from "vitest";
import { waInviteMessage, waMessage, waNumber, waShareUrl, waUrl } from "./whatsapp";

describe("aviso pelo WhatsApp", () => {
  it("normaliza o número", () => {
    expect(waNumber("+39 347 123 4567")).toBe("393471234567");
    expect(waNumber("0039 347 1234567")).toBe("393471234567");
    expect(waNumber("347 1234567")).toBe("393471234567");
    expect(waNumber("+55 11 91234-5678")).toBe("5511912345678");
    expect(waNumber("123")).toBeNull();
    expect(waNumber(null)).toBeNull();
  });

  it("monta a mensagem de cada resposta", () => {
    const base = { start_date: "2026-12-07", end_date: "2026-12-11", part: "full" as const };
    const ok = waMessage({ ...base, status: "approved" }, "Marco", "https://om/ferie/abc")!;
    expect(ok).toContain("Ciao Marco,");
    expect(ok).toContain("Le ferie dal 07/12/2026 al 11/12/2026: approvato ✅");
    expect(ok).toContain("Dettagli: https://om/ferie/abc");
    expect(waMessage({ ...base, status: "rejected", response_note: "Inventario" }, "Marco", null)).toContain("Nota: Inventario");
    expect(waMessage({ ...base, status: "proposed", proposed_start: "2026-12-14", proposed_end: "2026-12-18" }, "Marco", null))
      .toContain("ti proponiamo invece dal 14/12/2026 al 18/12/2026");
    expect(waMessage({ ...base, status: "pending" }, "Marco", null)).toBeNull();
  });

  it("permesso a ore", () => {
    const m = waMessage({ start_date: "2026-12-03", end_date: "2026-12-03", part: "pm", hours: 2.5, status: "approved" }, "Anna", null)!;
    expect(m).toContain("Il permesso di 2,5 ore (pomeriggio) il 03/12/2026: approvato");
  });

  it("link do wa.me com o texto codificado", () => {
    expect(waUrl("39347", "a b\nc")).toBe("https://wa.me/39347?text=a%20b%0Ac");
  });

  it("convite com o link pessoal: nome e link da pessoa", () => {
    const m = waInviteMessage("Marco", "https://om-shipment.vercel.app/ferie/abc");
    expect(m.startsWith("Ciao Marco,\n\nquesto è il tuo link personale per OM Service")).toBe(true);
    expect(m).toContain("\nSpedizione o ritiro\n");
    expect(m).toContain("\nhttps://om-shipment.vercel.app/ferie/abc\n");
    expect(m.endsWith("Grazie!\nOfficine Mattio")).toBe(true);
    expect(waShareUrl(null, "x")).toBe("https://wa.me/?text=x");
    expect(waShareUrl("39347", "x")).toBe("https://wa.me/39347?text=x");
  });
});

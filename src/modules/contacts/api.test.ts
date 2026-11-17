import { describe, expect, it } from "vitest";
import { buildContactsCsv, buildVCards, cleanContact, type PartnerContact } from "./api";

const base: PartnerContact = {
  id: "1", company: "DHL Express Italy", category: "Corriere", name: "Maria Rossi", role: "Account manager",
  phone: "+39 02 1234567", mobile: "+39 333 1234567", email: "maria.rossi@dhl.com", notes: "Tariffe; extra UE",
  active: true, created_at: "", updated_at: "",
};

describe("cleanContact", () => {
  it("tira espaços e deixa o e-mail em minúsculas", () => {
    const c = cleanContact({ company: "  MBE  Cuneo ", category: "", name: " Luca  Bianchi", role: null, phone: " ", mobile: null, email: " Luca@MBE.IT ", notes: "  " });
    expect(c).toEqual({ company: "MBE Cuneo", category: null, name: "Luca Bianchi", role: null, phone: null, mobile: null, email: "luca@mbe.it", notes: null });
  });
});

describe("buildVCards", () => {
  it("um cartão por pessoa, com empresa, função, telefones e e-mail", () => {
    const v = buildVCards([base, { ...base, id: "2", name: "Paolo", role: null, mobile: null, notes: null }]);
    expect(v.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(v).toContain("N:Rossi;Maria;;;");
    expect(v).toContain("FN:Maria Rossi");
    expect(v).toContain("ORG:DHL Express Italy");
    expect(v).toContain("TITLE:Account manager");
    expect(v).toContain("TEL;TYPE=CELL:+39 333 1234567");
    expect(v).toContain("EMAIL;TYPE=INTERNET,WORK:maria.rossi@dhl.com");
    expect(v).toContain("NOTE:Corriere — Tariffe\\; extra UE");
    expect(v).toContain("N:;Paolo;;;");
    expect(v).not.toMatch(/TITLE:\r\n|undefined|null/);
  });
});

describe("buildContactsCsv", () => {
  it("cabeçalho em italiano e campos com ponto e vírgula entre aspas", () => {
    const csv = buildContactsCsv([base]);
    const [head, row] = csv.replace("﻿", "").split("\r\n");
    expect(head).toBe("Azienda;Categoria;Nome;Ruolo;Telefono;Cellulare;Email;Note");
    expect(row).toBe('DHL Express Italy;Corriere;Maria Rossi;Account manager;+39 02 1234567;+39 333 1234567;maria.rossi@dhl.com;"Tariffe; extra UE"');
  });
});

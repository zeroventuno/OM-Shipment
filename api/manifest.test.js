import { describe, expect, it } from "vitest";
import { ferieManifest } from "./manifest.js";

describe("manifest do app de férias", () => {
  it("abre direto no link pessoal", () => {
    const m = ferieManifest("abcDEF123_-abcdefghij");
    expect(m.start_url).toBe("/ferie/abcDEF123_-abcdefghij");
    expect(m.scope).toBe("/ferie/");
    expect(m.display).toBe("standalone");
  });
  it("recusa token estranho", () => {
    expect(ferieManifest("../etc")).toBeNull();
    expect(ferieManifest("")).toBeNull();
  });
});

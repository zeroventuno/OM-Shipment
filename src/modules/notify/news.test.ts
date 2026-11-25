import { describe, expect, it } from "vitest";
import { diffNews } from "./news";

const item = (key: string) => ({ key, title: key, body: "", to: "/" });

describe("notificações de itens novos", () => {
  it("na primeira vez só marca o que já existe", () => {
    expect(diffNews([item("a"), item("b")], null)).toEqual({ notify: [], seen: ["a", "b"] });
  });
  it("avisa só o que não foi visto", () => {
    const r = diffNews([item("c"), item("a")], ["a", "b"]);
    expect(r.notify.map((i) => i.key)).toEqual(["c"]);
    expect(r.seen).toEqual(["c", "a", "b"]);
  });
  it("não repete o aviso", () => {
    expect(diffNews([item("c")], ["c", "a"]).notify).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { Presence } from "./presence";

describe("Presence", () => {
  it("tracks members per room", () => {
    const p = new Presence();
    p.join("r1", { id: "a", name: "Ann" });
    p.join("r1", { id: "b", name: "Bob" });
    p.join("r2", { id: "c", name: "Cy" });
    expect(p.list("r1").map((m) => m.name)).toEqual(["Ann", "Bob"]);
    expect(p.list("r2").map((m) => m.name)).toEqual(["Cy"]);
  });

  it("removes members and drops empty rooms", () => {
    const p = new Presence();
    p.join("r1", { id: "a", name: "Ann" });
    expect(p.leave("r1", "a")).toEqual([]);
    expect(p.list("r1")).toEqual([]);
    expect(p.leave("missing", "x")).toEqual([]);
  });

  it("re-joining with the same id replaces the member", () => {
    const p = new Presence();
    p.join("r1", { id: "a", name: "Ann" });
    p.join("r1", { id: "a", name: "Anna" });
    expect(p.list("r1")).toEqual([{ id: "a", name: "Anna" }]);
  });
});

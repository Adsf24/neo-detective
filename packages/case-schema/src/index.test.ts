import { describe, expect, it } from "vitest";
import { CaseMetaSchema } from "./index";

describe("CaseMetaSchema", () => {
  it("accepts a valid meta block", () => {
    const meta = { id: "missing-original", title: "The Missing Original", language: "en", players: { min: 3, max: 4 } };
    expect(CaseMetaSchema.parse(meta)).toEqual(meta);
  });

  it("rejects an empty id", () => {
    expect(() => CaseMetaSchema.parse({ id: "", title: "x", language: "en", players: { min: 1, max: 1 } })).toThrow();
  });
});

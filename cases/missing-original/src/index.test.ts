import { validateCasePack } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { missingOriginal } from "./index";

describe("The Missing Original", () => {
  const result = validateCasePack(missingOriginal);

  it("passes schema and reference validation", () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("gives every player slot a starting item and a contact", () => {
    if (!result.ok) return;
    for (const slot of result.pack.slots) {
      expect(slot.items.length, `slot ${slot.id}`).toBeGreaterThan(0);
      expect(slot.contacts.length, `slot ${slot.id}`).toBeGreaterThan(0);
    }
  });

  it("backs every fact with at least one item", () => {
    if (!result.ok) return;
    const evidenced = new Set(result.pack.items.flatMap((i) => i.evidences));
    const orphans = result.pack.facts.map((f) => f.id).filter((id) => !evidenced.has(id));
    expect(orphans).toEqual([]);
  });

  it("offers two independent sources for each required claim except the hidden original", () => {
    if (!result.ok) return;
    const byId = new Map(result.pack.claims.map((c) => [c.id, c]));
    for (const group of result.pack.accusation.requiredClaims) {
      for (const id of group) expect(byId.get(id)!.sources.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it("hides the trash record until the director reveals it", () => {
    if (!result.ok) return;
    expect(result.pack.items.find((i) => i.id === "m13_trash")?.hidden).toBe(true);
  });
});

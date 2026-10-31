import { describe, expect, it } from "vitest";
import { type CasePackInput, validateCasePack } from "./index";

function minimalPack(): CasePackInput {
  return {
    meta: { id: "tiny", title: "Tiny", language: "en", players: { min: 1, max: 2 }, minutes: 10 },
    briefing: { title: "Brief", text: "Something happened." },
    truth: { summary: "Ann did it.", culprit: "ann", timeline: [{ time: "10:00", event: "It happened" }] },
    facts: [{ id: "f1", statement: "Ann was there" }],
    acts: [{ id: "act1", title: "Act I" }],
    containers: [{ id: "desk", kind: "location", title: "Desk", access: "all" }],
    items: [{ id: "note", container: "desk", kind: "document", title: "Note", body: "hi", evidences: ["f1"] }],
    characters: [
      {
        id: "ann",
        name: "Ann",
        role: "suspect",
        voice: { gender: "female", style: "calm" },
        bio: "Ann.",
        personality: "Quiet.",
        coverStory: ["I was home."],
        knowledge: [
          { id: "ann_there", says: "I was there.", unlock: { presented: "note" }, truthful: true, setsFlags: ["ann_alerted"] },
        ],
        topics: [{ id: "where", description: "Where she was" }],
        never: ["Confess without evidence"],
        talksTo: "all",
        refusal: "No.",
        pressure: { limit: 3, endLine: "Bye.", cooldownMinutes: 5 },
        channel: "voice",
      },
    ],
    slots: [{ id: "A", label: "Player A", intro: "You found a note.", items: ["note"], contacts: ["ann"] }],
    events: [{ id: "hint", type: "support", when: { flag: "ann_alerted" }, actions: [{ type: "setFlag", flag: "done" }] }],
    claims: [{ id: "c1", statement: "Ann was there", sources: [{ id: "s1", items: ["note"] }] }],
    accusation: { culprit: "ann", requiredClaims: [["c1"]], motiveClaims: ["c1"], minSourcesPerClaim: 1, minItems: 1 },
    reconstruction: { narrator: "ann", text: "I did it." },
  };
}

describe("validateCasePack", () => {
  it("accepts a consistent pack", () => {
    const result = validateCasePack(minimalPack());
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("reports schema errors with paths", () => {
    const pack = minimalPack();
    pack.meta.id = "Not A Slug";
    const result = validateCasePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("meta.id");
  });

  it("reports dangling references", () => {
    const pack = minimalPack();
    pack.slots[0]!.items = ["missing"];
    pack.characters[0]!.knowledge[0]!.unlock = { all: [{ presented: "ghost" }, { askedAbout: "nope" }] };
    const result = validateCasePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('slot A: unknown item "missing"');
      expect(result.errors).toContain('knowledge ann_there: unknown item "ghost"');
      expect(result.errors).toContain('knowledge ann_there: unknown topic "nope"');
    }
  });

  it("reports flags that are waited on but never set", () => {
    const pack = minimalPack();
    pack.events![0]!.when = { flag: "never_set" };
    const result = validateCasePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('event hint: flag "never_set" is never set');
  });

  it("requires the accused culprit to match the truth", () => {
    const pack = minimalPack();
    pack.truth.culprit = "bob";
    const result = validateCasePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("accusation.culprit differs from truth.culprit");
  });
});

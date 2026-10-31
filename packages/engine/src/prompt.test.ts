import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { planTurn } from "./contract";
import { apply, createGame } from "./game";
import { characterMessages, checkReply, parseClassification } from "./prompt";
import { memoryOf } from "./contract";

const pack = CasePackSchema.parse(missingOriginal);
const marina = pack.characters.find((c) => c.id === "marina")!;

describe("classifier parsing", () => {
  it("keeps only known topics", () => {
    expect(parseClassification('{"topics":["took_original","made_up"],"accusatory":true}', marina)).toEqual({
      topics: ["took_original"],
      accusatory: true,
    });
  });

  it("survives junk", () => {
    expect(parseClassification("sure! here you go", marina)).toEqual({ topics: [], accusatory: false });
  });
});

describe("reply check", () => {
  const allowed = new Set(["marina_registry_lie"]);

  it("accepts a reply that uses allowed knowledge", () => {
    expect(checkReply('```json\n{"reply":"Paul asked me.","used":["marina_registry_lie"]}\n```', allowed)).toEqual({
      ok: true,
      reply: "Paul asked me.",
      used: ["marina_registry_lie"],
    });
  });

  it("rejects locked knowledge, empty replies and non-JSON", () => {
    expect(checkReply('{"reply":"I took it.","used":["marina_took"]}', allowed)).toMatchObject({ ok: false });
    expect(checkReply('{"reply":"  ","used":[]}', allowed)).toMatchObject({ ok: false });
    expect(checkReply("I took it.", allowed)).toMatchObject({ ok: false });
  });
});

describe("character prompt", () => {
  it("contains the cover story and unlocked knowledge but no locked knowledge or truth", () => {
    const state = createGame(pack);
    for (const id of ["a", "b", "c"]) apply(pack, state, { type: "join", player: id, name: id }, 0);
    apply(pack, state, { type: "start" }, 0);
    const plan = planTurn(pack, state, { character: "marina", asker: "a", topics: [], accusatory: false, presented: ["c02"] }, 0);
    if (plan.kind !== "reply") throw new Error("expected a reply plan");

    const text = characterMessages({
      pack,
      character: marina,
      active: plan.active,
      presented: plan.presented,
      memory: memoryOf(state, "marina"),
      askerName: "Ann",
      question: "Why did you change the card?",
    })
      .map((m) => m.content)
      .join("\n");

    expect(text).toContain(marina.coverStory[0]);
    expect(text).toContain("marina_registry_lie");
    expect(text).toContain("Registry — change log");
    for (const k of marina.knowledge.filter((k) => k.id !== "marina_registry_lie")) expect(text).not.toContain(k.says);
    expect(text).not.toContain(pack.truth.summary.slice(0, 40));
    expect(text).not.toContain("packing cabinet");
  });
});

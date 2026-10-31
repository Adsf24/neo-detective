import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { planTurn } from "./contract";
import { apply, createGame, type GameState } from "./game";
import { scoreAccusation } from "./scoring";
import { viewFor } from "./view";

const pack = CasePackSchema.parse(missingOriginal);
const T0 = 1_000_000;
const min = (m: number) => T0 + m * 60_000;

function started(): GameState {
  const state = createGame(pack);
  for (const id of ["a", "b", "c"]) apply(pack, state, { type: "join", player: id, name: id.toUpperCase() }, T0);
  apply(pack, state, { type: "start" }, T0);
  for (const p of state.players) apply(pack, state, { type: "unlock", player: p.id, container: "computer", password: "PG-1962" }, T0);
  return state;
}

describe("scoring", () => {
  it("scores the reference chain as solved", () => {
    expect(scoreAccusation(pack, "marina", ["c03", "c02", "m12"])).toMatchObject({ culprit: true, motive: true, proof: "full", outcome: "solved" });
  });

  it("accepts the correspondence route instead of the registry", () => {
    expect(scoreAccusation(pack, "marina", ["c03", "m13", "m10"]).outcome).toBe("solved");
  });

  it("calls a right name without a chain a guess", () => {
    const s = scoreAccusation(pack, "marina", ["p1", "m05", "c04"]);
    expect(s.outcome).toBe("right_unproven");
    expect(s.missingGroups.length).toBeGreaterThan(0);
  });

  it("marks the wrong person wrong however good the evidence", () => {
    expect(scoreAccusation(pack, "paul", ["c03", "c02", "m12"]).outcome).toBe("wrong");
  });

  it("requires the motive for full proof", () => {
    expect(scoreAccusation(pack, "marina", ["c03", "c02", "c08"])).toMatchObject({ motive: false, proof: "partial", outcome: "right_unproven" });
  });
});

describe("verdict and accusation", () => {
  it("collects secret votes, reveals them together, then takes one accusation", () => {
    const state = started();
    for (const item of ["c03", "c02", "m12"]) apply(pack, state, { type: "post", player: "b", item }, min(5));

    expect(apply(pack, state, { type: "vote", player: "a", who: "marina" }, min(20))).toMatchObject({ ok: false });
    expect(apply(pack, state, { type: "callVerdict", player: "a" }, min(20))).toEqual({ ok: true });
    apply(pack, state, { type: "vote", player: "a", who: "marina" }, min(20));
    apply(pack, state, { type: "vote", player: "b", who: "paul" }, min(20));

    const mid = viewFor(pack, state, "c", min(20))!.verdict;
    expect(mid).toMatchObject({ open: true, voted: ["a", "b"], revealed: null });
    expect(JSON.stringify(mid)).not.toContain("paul"); // nobody sees a vote before all are in

    expect(apply(pack, state, { type: "accuse", player: "a", who: "marina", what: "x", why: "y", items: ["c03", "c02", "m12"] }, min(21))).toMatchObject({ ok: false });
    apply(pack, state, { type: "vote", player: "c", who: "marina" }, min(21));
    expect(viewFor(pack, state, "c", min(21))!.verdict.revealed).toEqual({ a: "marina", b: "paul", c: "marina" });

    expect(apply(pack, state, { type: "accuse", player: "a", who: "marina", what: "Swapped it", why: "Money", items: ["c03"] }, min(22))).toMatchObject({ ok: false });
    expect(apply(pack, state, { type: "accuse", player: "a", who: "marina", what: "Swapped it", why: "Money", items: ["c03", "c02", "m12"] }, min(22))).toEqual({ ok: true });
    expect(state.phase).toBe("finished");
  });
});

describe("debrief", () => {
  it("stays hidden until the end, then tells the truth and the team's own story", () => {
    const state = started();
    expect(viewFor(pack, state, "a", min(1))!.debrief).toBeNull();

    apply(pack, state, { type: "post", player: "b", item: "c02" }, min(4));
    planTurn(pack, state, { character: "marina", asker: "b", topics: [], accusatory: false, presented: ["c02"] }, min(6));
    planTurn(pack, state, { character: "marina", asker: "c", topics: ["took_original"], accusatory: false, presented: ["m13"] }, min(9));
    state.transition = { toAct: "act2", since: min(6) };
    apply(pack, state, { type: "version", player: "a", who: "marina", what: "w", why: "y", items: ["c02"] }, min(7));
    for (const item of ["c03", "m12"]) apply(pack, state, { type: "post", player: "b", item }, min(10));
    apply(pack, state, { type: "callVerdict", player: "a" }, min(20));
    for (const p of ["a", "b", "c"]) apply(pack, state, { type: "vote", player: p, who: "marina" }, min(20));
    apply(pack, state, { type: "accuse", player: "a", who: "marina", what: "Swapped it", why: "Money", items: ["c03", "c02", "m12"] }, min(21));

    const d = viewFor(pack, state, "b", min(21))!.debrief!;
    expect(d.score.outcome).toBe("solved");
    expect(d.reconstruction.narrator).toBe("Marina Cole");
    expect(d.history.highlights.join("\n")).toContain("Minute 4: B put the first piece on the Board");
    expect(d.history.highlights.join("\n")).toContain("Minute 7: the team first named Marina Cole");
    expect(d.history.highlights.join("\n")).toContain("B got Marina Cole to lie by showing Registry — change log");
    expect(d.history.highlights.join("\n")).toContain("Minute 9: C asked the question that broke Marina Cole");
    expect(d.history.missed).toContain("Archive, shelf 2 — Thursday");
  });
});

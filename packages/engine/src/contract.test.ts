import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { planTurn, type TurnInput } from "./contract";
import { apply, createGame, type GameState } from "./game";
import { viewFor } from "./view";

// Every row of Marina's confession table, plus the negative cases that keep
// her from confessing to pressure alone.

const pack = CasePackSchema.parse(missingOriginal);
const T0 = 1_000_000;

function started(players = 4): GameState {
  const state = createGame(pack);
  for (let i = 0; i < players; i++) apply(pack, state, { type: "join", player: `p${i}`, name: `P${i}` }, T0);
  apply(pack, state, { type: "start" }, T0);
  return state;
}

function turn(state: GameState, input: Partial<TurnInput> & { character: string }, now = T0) {
  return planTurn(pack, state, { asker: "p0", topics: [], accusatory: false, presented: [], ...input }, now);
}

function said(state: GameState, input: Partial<TurnInput> & { character: string }, now = T0): string[] {
  const plan = turn(state, input, now);
  return plan.kind === "reply" ? plan.active.map((k) => k.id) : [plan.kind];
}

describe("Marina", () => {
  const marina = (state: GameState, input: Partial<TurnInput> = {}, now = T0) => said(state, { character: "marina", ...input }, now);

  it("starts with the cover story only", () => {
    expect(marina(started(), { topics: ["archive_afternoon"] })).toEqual([]);
  });

  it("admits the registry edit with a lie when shown the change log, and becomes alerted", () => {
    const state = started();
    expect(marina(state, { presented: ["c02"] })).toEqual(["marina_registry_lie"]);
    expect(state.flags.has("marina_alerted")).toBe(true);
  });

  it("explains the Stern mail away when shown any of the correspondence", () => {
    for (const item of ["m10", "m12", "m13", "m14", "m13_trash"]) {
      expect(marina(started(), { presented: [item] })).toContain("marina_stern_lie");
    }
  });

  it("does not confess to a direct question backed by only one piece of evidence", () => {
    const state = started();
    expect(marina(state, { presented: ["c02"], topics: ["took_original"] })).not.toContain("marina_took");
    expect(marina(state, { topics: ["took_original"], accusatory: true })).not.toContain("marina_took");
  });

  const confessionPaths: [string, string[]][] = [
    ["the key mail and the change log", ["m13", "c02"]],
    ["the key mail and the packing table photo", ["m13", "p3"]],
    ["Stern's terms and the packing table photo", ["m12", "p3"]],
    ["the recovered mail and the change log", ["m13_trash", "c02"]],
  ];

  for (const [label, items] of confessionPaths) {
    it(`confesses to ${label} plus a direct question`, () => {
      const state = started();
      const now = marina(state, { presented: items, topics: ["took_original"] });
      expect(now).toContain("marina_took");
      expect(now).not.toContain("marina_registry_lie");
      expect(now).not.toContain("marina_stern_lie");
      expect(state.flags.has("marina_confessed")).toBe(true);
    });
  }

  it("needs the direct question even with the evidence in front of her", () => {
    const state = started();
    expect(marina(state, { presented: ["m13", "c02"] })).not.toContain("marina_took");
    expect(marina(state, { topics: ["took_original"] })).toContain("marina_took");
  });

  it("tells where the original is only after confessing and being asked, which reveals the cabinet", () => {
    const state = started();
    expect(marina(state, { topics: ["where_original"] })).not.toContain("marina_where");
    marina(state, { presented: ["m13", "c02"], topics: ["took_original"] });
    expect(marina(state, { topics: ["where_original"] })).toContain("marina_where");
    expect(viewFor(pack, state, "p1", T0)!.containers.map((c) => c.id)).toContain("packing_cabinet");
  });

  it("deflects the envelope before confessing and explains it after", () => {
    const state = started();
    expect(marina(state, { presented: ["p3"] })).toContain("marina_envelope_deflect");
    marina(state, { presented: ["m13"], topics: ["took_original"] });
    const after = marina(state, { topics: ["envelope"] });
    expect(after).toContain("marina_envelope_truth");
    expect(after).not.toContain("marina_envelope_deflect");
  });

  it("denies knowing how the original got into the cabinet until she confesses", () => {
    const state = started();
    const found = marina(state, { presented: ["original_found"], topics: ["took_original"] });
    expect(found).toContain("marina_found_deflect");
    expect(found).not.toContain("marina_took");
  });

  it("brushes off the deleted mail, then falls silent at the trash record", () => {
    const state = started();
    expect(marina(state, { topics: ["deleted_email"] })).not.toContain("marina_deleted_deflect");
    state.flags.add("email_deleted");
    expect(marina(state, { topics: ["deleted_email"] })).toContain("marina_deleted_deflect");
    const shown = marina(state, { presented: ["m13_trash"] });
    expect(shown).toContain("marina_trash_silence");
    expect(shown).not.toContain("marina_deleted_deflect");
  });

  it("gives the motive only after confessing", () => {
    const state = started();
    expect(marina(state, { topics: ["stern"] })).not.toContain("marina_motive");
    marina(state, { presented: ["m12", "p3"], topics: ["took_original"] });
    expect(marina(state, { topics: ["stern"] })).toContain("marina_motive");
  });

  it("hangs up after three accusations without evidence and stays away for the cooldown", () => {
    const state = started();
    expect(turn(state, { character: "marina", accusatory: true, topics: ["took_original"] }).kind).toBe("reply");
    expect(turn(state, { character: "marina", accusatory: true }).kind).toBe("reply");
    expect(turn(state, { character: "marina", accusatory: true }).kind).toBe("end");
    expect(turn(state, { character: "marina" }, T0 + 60_000).kind).toBe("unavailable");
    expect(turn(state, { character: "marina" }, T0 + 5 * 60_000).kind).toBe("reply");
    expect(state.flags.has("marina_confessed")).toBe(false);
  });

  it("resets pressure when new evidence arrives", () => {
    const state = started();
    turn(state, { character: "marina", accusatory: true });
    turn(state, { character: "marina", accusatory: true });
    turn(state, { character: "marina", accusatory: true, presented: ["c02"] });
    expect(turn(state, { character: "marina", accusatory: true }).kind).toBe("reply");
  });
});

describe("Oliver", () => {
  it("talks only to slot C", () => {
    const state = started();
    expect(turn(state, { character: "oliver", asker: "p0" })).toMatchObject({ kind: "refuse" });
    expect(turn(state, { character: "oliver", asker: "p2" }).kind).toBe("reply");
  });

  it("shares what he saw but never the swap itself", () => {
    const ids = said(started(), { character: "oliver", asker: "p2" });
    expect(ids).toEqual(
      expect.arrayContaining(["oliver_morning_photo", "oliver_left", "oliver_marina_stayed", "oliver_paul_suspicion"]),
    );
    expect(ids).not.toContain("oliver_letter");
  });

  it("owns up to the anonymous letter when shown it and asked", () => {
    const state = started(3); // with three players slot A holds the letter, but C still asks
    expect(said(state, { character: "oliver", asker: "p2", presented: ["anon_letter"] })).not.toContain("oliver_letter");
    expect(said(state, { character: "oliver", asker: "p2", topics: ["anonymous_letter"] })).toContain("oliver_letter");
  });
});

describe("Paul", () => {
  it("refutes Marina's restoration story when asked", () => {
    const state = started();
    expect(said(state, { character: "paul", topics: ["restoration_request"] })).toContain("paul_no_request");
    expect(state.flags.has("paul_denied")).toBe(true);
  });
});

describe("audit trail", () => {
  it("logs presented items and admissions for the team history", () => {
    const state = started();
    turn(state, { character: "marina", presented: ["c02"] });
    expect(state.log.filter((l) => l.type === "present").map((l) => l.detail.item)).toEqual(["c02"]);
    expect(state.log.filter((l) => l.type === "admit").map((l) => l.detail.knowledge)).toEqual(["marina_registry_lie"]);
  });
});

import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { tick } from "./director";
import { apply, createGame, type GameState } from "./game";
import { viewFor } from "./view";

const pack = CasePackSchema.parse(missingOriginal);
const T0 = 1_000_000;
const min = (m: number) => T0 + m * 60_000;

function started(players = 4): GameState {
  const state = createGame(pack);
  for (let i = 0; i < players; i++) apply(pack, state, { type: "join", player: `p${i}`, name: `P${i}` }, T0);
  apply(pack, state, { type: "start" }, T0);
  for (const p of state.players) apply(pack, state, { type: "unlock", player: p.id, container: "computer", password: "PG-1962" }, T0);
  return state;
}

const inbox = (state: GameState, player: string) => viewFor(pack, state, player, T0)!.inbox.map((m) => m.from);

function recordVersion(state: GameState, now: number) {
  if (!state.board.length) apply(pack, state, { type: "post", player: "p1", item: "c02" }, now);
  return apply(pack, state, { type: "version", player: "p0", who: "marina", what: "She swapped it", why: "Money", items: ["c02"] }, now);
}

describe("director", () => {
  it("does nothing before the game starts or too early", () => {
    expect(tick(pack, createGame(pack), T0)).toEqual([]);
    expect(tick(pack, started(), min(1))).toEqual([]);
  });

  it("lets Oliver reach out to slot C only", () => {
    const state = started();
    expect(tick(pack, state, min(3))).toEqual(["oliver_reaches_out"]);
    expect(inbox(state, "p2")).toEqual(["Oliver Vance"]);
    expect(inbox(state, "p0")).toEqual([]);
    expect(tick(pack, state, min(4))).toEqual([]); // once
  });

  it("opens the act transition when Marina is alerted and pauses until a version is recorded", () => {
    const state = started();
    tick(pack, state, min(3));
    state.flags.add("marina_alerted");

    expect(tick(pack, state, min(4))).toEqual(["act_two"]);
    expect(state.transition).toMatchObject({ toAct: "act2" });
    expect(tick(pack, state, min(7))).toEqual([]); // paused: the deletion waits

    expect(apply(pack, state, { type: "version", player: "p0", who: "marina", what: "x", why: "y", items: [] }, min(7))).toMatchObject({ ok: false });
    expect(recordVersion(state, min(7))).toEqual({ ok: true });
    expect(state.act).toBe("act2");
    expect(state.transition).toBeNull();
    expect(state.versions[0]).toMatchObject({ act: "act1", who: "marina", items: ["c02"] });

    expect(tick(pack, state, min(7))).toEqual(["marina_deletes_email"]);
    expect(state.trashed.get("m13")).toBe("m13_trash");
    expect(state.flags.has("email_deleted")).toBe(true);
  });

  it("delays the deletion by its configured minutes", () => {
    const state = started();
    state.act = "act2"; // skip the transition and Oliver's message for this test
    state.fired.add("act_two");
    state.fired.add("oliver_reaches_out");
    state.flags.add("marina_alerted");
    expect(tick(pack, state, min(5))).toEqual([]);
    expect(tick(pack, state, min(6.9))).toEqual([]);
    expect(tick(pack, state, min(7))).toEqual(["marina_deletes_email"]);
  });

  it("falls back to the act transition at 15 minutes", () => {
    const state = started();
    tick(pack, state, min(3));
    expect(tick(pack, state, min(15))).toContain("act_two");
  });

  it("sends the first support hint only to a team with nothing useful on the Board", () => {
    const idle = started();
    idle.fired.add("act_two");
    expect(tick(pack, idle, min(10))).toContain("hint_compare_photos");
    expect(inbox(idle, "p1")).toContain("Paul Grant");

    const busy = started();
    busy.fired.add("act_two");
    apply(pack, busy, { type: "post", player: "p0", item: "p2" }, min(5));
    expect(tick(pack, busy, min(10))).not.toContain("hint_compare_photos");
  });

  it("routes slot D's hint to slot A when D is merged", () => {
    const state = started(3);
    state.fired.add("act_two");
    tick(pack, state, min(18));
    expect(inbox(state, "p0")).toContain("A well-wisher");
  });

  it("requests the verdict once the key evidence is on the Board", () => {
    const state = started();
    state.fired.add("act_two");
    apply(pack, state, { type: "post", player: "p1", item: "m13" }, min(5));
    apply(pack, state, { type: "post", player: "p0", item: "p3" }, min(5));
    expect(tick(pack, state, min(5))).toContain("verdict_requested");
    expect(state.verdictRequested).toBe(true);
  });

  it("never fires the deletion for a team that hasn't alerted Marina", () => {
    const state = started();
    state.fired.add("act_two");
    for (let m = 0; m <= 40; m += 1) tick(pack, state, min(m));
    expect(state.trashed.size).toBe(0);
  });
});

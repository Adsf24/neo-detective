import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { evaluate } from "./conditions";
import { tick } from "./director";
import { apply, createGame, trashItem, type GameState } from "./game";
import { viewFor } from "./view";

const pack = CasePackSchema.parse(missingOriginal);
const T0 = 1_000_000;

function started(players: number): GameState {
  const state = createGame(pack);
  for (let i = 0; i < players; i++) apply(pack, state, { type: "join", player: `p${i}`, name: `P${i}` }, T0);
  expect(apply(pack, state, { type: "start" }, T0)).toEqual({ ok: true });
  return state;
}

const ids = (state: GameState, player: string, now = T0) => viewFor(pack, state, player, now)!.items.map((i) => i.id);

describe("conditions", () => {
  const world = { flags: new Set(["f"]), board: new Set(["b"]), minutesElapsed: 10 };

  it("evaluates world predicates and combinators", () => {
    expect(evaluate({ all: [{ flag: "f" }, { onBoard: "b" }, { minutesElapsed: 10 }] }, world)).toBe(true);
    expect(evaluate({ any: [{ flag: "x" }, { not: { onBoard: "z" } }] }, world)).toBe(true);
    expect(evaluate({ minutesElapsed: 11 }, world)).toBe(false);
  });

  it("treats dialogue predicates as false outside a conversation", () => {
    expect(evaluate({ presented: "b" }, world)).toBe(false);
    expect(evaluate({ not: { admitted: "k" } }, world)).toBe(true);
  });

  it("evaluates dialogue predicates inside a conversation", () => {
    const ctx = {
      ...world,
      dialogue: { presented: new Set(["m13"]), askedAbout: new Set(["took"]), askedBy: "C", admitted: new Set<string>() },
    };
    expect(evaluate({ all: [{ presented: "m13" }, { askedAbout: "took" }, { askedBy: "C" }] }, ctx)).toBe(true);
    expect(evaluate({ admitted: "x" }, ctx)).toBe(false);
  });
});

describe("lobby", () => {
  it("assigns slots in order and enforces capacity and minimum", () => {
    const state = createGame(pack);
    apply(pack, state, { type: "join", player: "a", name: "Ann" }, T0);
    apply(pack, state, { type: "join", player: "b", name: "Bob" }, T0);
    expect(apply(pack, state, { type: "start" }, T0)).toMatchObject({ ok: false });
    apply(pack, state, { type: "join", player: "c", name: "Cy" }, T0);
    apply(pack, state, { type: "join", player: "d", name: "Di" }, T0);
    expect(state.players.map((p) => p.slot)).toEqual(["A", "B", "C", "D"]);
    expect(apply(pack, state, { type: "join", player: "e", name: "Ed" }, T0)).toMatchObject({ ok: false });
  });

  it("lets a known player rejoin after the start", () => {
    const state = started(3);
    expect(apply(pack, state, { type: "join", player: "p1", name: "Renamed" }, T0)).toEqual({ ok: true });
    expect(apply(pack, state, { type: "join", player: "late", name: "Late" }, T0)).toMatchObject({ ok: false });
  });
});

describe("starting materials", () => {
  it("delivers each slot's items to its player only", () => {
    const state = started(4);
    expect(viewFor(pack, state, "p0", T0)!.folder).toEqual(["note_paul"]);
    expect(viewFor(pack, state, "p1", T0)!.folder).toEqual(["note_password"]);
    expect(viewFor(pack, state, "p3", T0)!.folder).toEqual(["anon_letter"]);
    expect(ids(state, "p1")).not.toContain("anon_letter");
  });

  it("merges slot D into A with three players", () => {
    const state = started(3);
    expect(viewFor(pack, state, "p0", T0)!.folder).toEqual(["note_paul", "anon_letter"]);
  });

  it("gives only slot C the private contact", () => {
    const state = started(4);
    expect(viewFor(pack, state, "p2", T0)!.contacts.map((c) => c.id)).toContain("oliver");
    expect(viewFor(pack, state, "p0", T0)!.contacts.map((c) => c.id)).not.toContain("oliver");
  });
});

describe("access", () => {
  it("keeps the computer locked per player until the password is entered", () => {
    const state = started(4);
    expect(ids(state, "p1")).not.toContain("c02");
    expect(apply(pack, state, { type: "unlock", player: "p1", container: "computer", password: "nope" }, T0)).toMatchObject({ ok: false });
    expect(apply(pack, state, { type: "unlock", player: "p1", container: "computer", password: "PG-1962" }, T0)).toEqual({ ok: true });
    expect(ids(state, "p1")).toEqual(expect.arrayContaining(["c02", "m01", "m13"]));
    expect(ids(state, "p0")).not.toContain("c02");
  });

  it("restricts the gallery to slot A", () => {
    const state = started(4);
    expect(ids(state, "p0")).toContain("p3");
    expect(ids(state, "p1")).not.toContain("p3");
  });

  it("shares a posted item with everyone through the Board", () => {
    const state = started(4);
    apply(pack, state, { type: "unlock", player: "p1", container: "computer", password: "PG-1962" }, T0);
    expect(apply(pack, state, { type: "post", player: "p1", item: "c02", note: "Marina changed it" }, T0)).toEqual({ ok: true });
    expect(ids(state, "p0")).toContain("c02");
    expect(viewFor(pack, state, "p0", T0)!.board[0]).toMatchObject({ item: "c02", postedBy: "p1", note: "Marina changed it" });
    expect(apply(pack, state, { type: "post", player: "p0", item: "c02" }, T0)).toMatchObject({ ok: false });
  });

  it("refuses to post what the player cannot see", () => {
    const state = started(4);
    expect(apply(pack, state, { type: "post", player: "p0", item: "c02" }, T0)).toMatchObject({ ok: false });
  });

  it("sends an item to another player's folder", () => {
    const state = started(4);
    apply(pack, state, { type: "send", player: "p0", item: "p3", to: "p1" }, T0);
    expect(ids(state, "p1")).toContain("p3");
  });

  it("reveals the cabinet once the hotspot is marked, and searches it only with a second detective", () => {
    const state = started(4);
    expect(viewFor(pack, state, "p0", T0)!.containers.map((c) => c.id)).not.toContain("packing_cabinet");
    apply(pack, state, { type: "hotspot", player: "p0", item: "p3", hotspot: "p3_cabinet" }, T0);
    const cabinet = viewFor(pack, state, "p1", T0)!.containers.find((c) => c.id === "packing_cabinet");
    expect(cabinet).toMatchObject({ needsCouncil: true });
    expect(ids(state, "p0")).not.toContain("original_found");

    const request = { type: "councilRequest", player: "p0", payload: { kind: "search", container: "packing_cabinet" } } as const;
    expect(apply(pack, state, request, T0)).toEqual({ ok: true });
    const council = state.councils[0]!;
    expect(apply(pack, state, { type: "councilDecide", player: "p0", council: council.id, approve: true }, T0)).toMatchObject({ ok: false });
    expect(apply(pack, state, { type: "councilDecide", player: "p1", council: council.id, approve: true }, T0)).toEqual({ ok: true });
    expect(ids(state, "p0")).toContain("original_found");
    expect(ids(state, "p2")).toContain("original_found");
  });

  it("moves a trashed mail to its trash record but keeps a Board copy", () => {
    const state = started(4);
    apply(pack, state, { type: "unlock", player: "p1", container: "computer", password: "PG-1962" }, T0);
    trashItem(state, "m13", "m13_trash");
    expect(ids(state, "p1")).not.toContain("m13");
    expect(ids(state, "p1")).toContain("m13_trash");
    expect(viewFor(pack, state, "p1", T0)!.trash).toEqual({ m13: "m13_trash" });

    const kept = started(4);
    apply(pack, kept, { type: "unlock", player: "p1", container: "computer", password: "PG-1962" }, T0);
    apply(pack, kept, { type: "post", player: "p1", item: "m13" }, T0);
    trashItem(kept, "m13", "m13_trash");
    expect(ids(kept, "p0")).toContain("m13");
  });
});

describe("player view", () => {
  it("never leaks the truth, knowledge, passwords or evidence links", () => {
    const state = started(4);
    for (const p of state.players) apply(pack, state, { type: "unlock", player: p.id, container: "computer", password: "PG-1962" }, T0);
    const json = JSON.stringify(state.players.map((p) => viewFor(pack, state, p.id, T0)));
    expect(json).not.toContain(pack.truth.summary.slice(0, 40));
    expect(json).not.toContain('"password"'); // the value itself legitimately sits in B's note
    expect(json).not.toContain("evidences");
    expect(json).not.toContain("setsFlag");
    for (const c of pack.characters) for (const k of c.knowledge) expect(json).not.toContain(k.says);
  });
});

describe("demo start", () => {
  it("starts a few minutes in with the computer open and key evidence on the Board", () => {
    const state = createGame(pack);
    for (const id of ["a", "b", "c"]) apply(pack, state, { type: "join", player: id, name: id }, T0);
    expect(apply(pack, state, { type: "start", demo: true }, T0)).toEqual({ ok: true });
    expect(state.startedAt).toBe(T0 - 8 * 60_000);
    expect(state.board.map((b) => b.item)).toEqual(["c03", "c02", "p1", "p2"]);
    expect(ids(state, "c")).toContain("m13");
    expect(state.fired.has("oliver_reaches_out")).toBe(true);
    expect(tick(pack, state, T0)).not.toContain("verdict_requested"); // demo must not jump to the end
  });
});

describe("solo test mode", () => {
  it("lets one player start, holding every slot's materials and contacts, with councils auto-approved", () => {
    const state = createGame(pack);
    apply(pack, state, { type: "join", player: "me", name: "Vic" }, T0);
    expect(apply(pack, state, { type: "start" }, T0)).toMatchObject({ ok: false });
    expect(apply(pack, state, { type: "start", solo: true }, T0)).toEqual({ ok: true });
    const view = viewFor(pack, state, "me", T0)!;
    expect(view.folder).toEqual(["note_paul", "note_password", "note_oliver", "anon_letter"]);
    expect(view.contacts.map((c) => c.id)).toEqual(expect.arrayContaining(["marina", "oliver", "paul"]));
    expect(ids(state, "me")).toContain("p3");

    apply(pack, state, { type: "hotspot", player: "me", item: "p3", hotspot: "p3_cabinet" }, T0);
    apply(pack, state, { type: "councilRequest", player: "me", payload: { kind: "search", container: "packing_cabinet" } }, T0);
    expect(ids(state, "me")).toContain("original_found");
  });

  it("deals slots round-robin for two players", () => {
    const state = createGame(pack);
    apply(pack, state, { type: "join", player: "a", name: "A" }, T0);
    apply(pack, state, { type: "join", player: "b", name: "B" }, T0);
    apply(pack, state, { type: "start", solo: true }, T0);
    expect(viewFor(pack, state, "a", T0)!.folder).toEqual(["note_paul", "note_oliver"]);
    expect(viewFor(pack, state, "b", T0)!.folder).toEqual(["note_password", "anon_letter"]);
  });
});

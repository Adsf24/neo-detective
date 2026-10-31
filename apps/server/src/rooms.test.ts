import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { describe, expect, it } from "vitest";
import { ScriptedProvider } from "./llm";
import { Rooms } from "./rooms";

const pack = CasePackSchema.parse(missingOriginal);
const T0 = 1_000_000;

async function startedRoom() {
  const rooms = new Rooms(pack, new ScriptedProvider());
  for (const id of ["a", "b", "c"]) await rooms.act("r", { type: "join", player: id, name: id.toUpperCase() }, T0);
  await rooms.act("r", { type: "start" }, T0);
  await rooms.act("r", { type: "unlock", player: "b", container: "computer", password: "PG-1962" }, T0);
  return rooms;
}

describe("Rooms", () => {
  it("keeps games separate per room code", async () => {
    const rooms = new Rooms(pack, new ScriptedProvider());
    await rooms.act("one", { type: "join", player: "a", name: "Ann" });
    await rooms.act("two", { type: "join", player: "b", name: "Bob" });
    expect([...rooms.views("one").keys()]).toEqual(["a"]);
    expect([...rooms.views("two").keys()]).toEqual(["b"]);
  });

  it("holds a presentation to the suspect until a second detective agrees, then plays it", async () => {
    const rooms = await startedRoom();
    const res = await rooms.ask("r", "b", { character: "marina", question: "Why did you change this?", presented: ["c02"], shared: true }, T0);
    expect(res).toMatchObject({ ok: true, kind: "council" });
    expect(rooms.get("r").state.flags.has("marina_alerted")).toBe(false);

    const council = rooms.views("r", T0).get("a")!.councils[0]!;
    expect(council).toMatchObject({ status: "open", summary: "Show Registry — change log to Marina Cole" });

    expect(await rooms.act("r", { type: "councilDecide", player: "a", council: council.id, approve: true }, T0)).toEqual({ ok: true });
    const view = rooms.views("r", T0).get("c")!;
    expect(view.calls.marina!.at(-1)!.reply).toContain("Paul asked me");
    expect(rooms.get("r").state.flags.has("marina_alerted")).toBe(true);
    expect(view.transition).toMatchObject({ toAct: "act2" }); // the director reacted in the same step
  });

  it("drops hidden items from a presentation", async () => {
    const rooms = await startedRoom();
    // Player a cannot see the change log: the request goes through without it, so no council.
    const res = await rooms.ask("r", "a", { character: "marina", question: "Anything to add?", presented: ["c02"], shared: false }, T0);
    expect(res).toMatchObject({ ok: true, kind: "reply" });
  });

  it("does not need a council to ask questions without evidence", async () => {
    const rooms = await startedRoom();
    expect(await rooms.ask("r", "b", { character: "marina", question: "Where were you?", presented: [], shared: false }, T0)).toMatchObject({ kind: "reply" });
  });
});

describe("credit guard", () => {
  class SlowProvider extends ScriptedProvider {
    override async complete(req: Parameters<ScriptedProvider["complete"]>[0]) {
      await new Promise((r) => setTimeout(r, 20));
      return super.complete(req);
    }
  }

  it("lets a player ask one question at a time", async () => {
    const rooms = new Rooms(pack, new SlowProvider());
    for (const id of ["a", "b", "c"]) await rooms.act("r", { type: "join", player: id, name: id }, T0);
    await rooms.act("r", { type: "start" }, T0);
    const q = { character: "marina", question: "Where were you?", presented: [], shared: false };
    const [first, second] = await Promise.all([rooms.ask("r", "a", q, T0), rooms.ask("r", "a", q, T0)]);
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: false, error: "Wait for the answer first." });
  });

  it("caps questions per minute per room", async () => {
    const rooms = new Rooms(pack, new ScriptedProvider());
    for (const id of ["a", "b", "c"]) await rooms.act("r", { type: "join", player: id, name: id }, T0);
    await rooms.act("r", { type: "start" }, T0);
    const q = { character: "paul", question: "Where were you?", presented: [], shared: false };
    for (let i = 0; i < 30; i++) expect(await rooms.ask("r", "a", q, T0 + i)).toMatchObject({ ok: true });
    expect(await rooms.ask("r", "a", q, T0 + 31)).toMatchObject({ ok: false });
    expect(await rooms.ask("r", "a", q, T0 + 61_000)).toMatchObject({ ok: true });
  });
});

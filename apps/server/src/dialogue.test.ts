import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { apply, createGame, viewFor, type GameState } from "@neo/engine";
import { describe, expect, it } from "vitest";
import { ask } from "./dialogue";
import { ScriptedProvider, type CompletionRequest, type LlmProvider } from "./llm";

const pack = CasePackSchema.parse(missingOriginal);

function started(): GameState {
  const state = createGame(pack);
  for (const id of ["a", "b", "c", "d"]) apply(pack, state, { type: "join", player: id, name: id.toUpperCase() }, 0);
  apply(pack, state, { type: "start" }, 0);
  return state;
}

// A model that tries to blurt out a confession it was never given.
class LeakyProvider implements LlmProvider {
  readonly name = "leaky";
  calls: CompletionRequest[] = [];
  async complete(req: CompletionRequest) {
    this.calls.push(req);
    if (req.tier === "fast") return '{"topics":["took_original"],"accusatory":true}';
    return '{"reply":"Fine, I took it and hid it in the cabinet.","used":["marina_took","marina_where"]}';
  }
}

describe("ask", () => {
  it("answers from the cover story with the scripted provider", async () => {
    const res = await ask(pack, started(), new ScriptedProvider(), { character: "marina", asker: "a", question: "What did you do on Wednesday afternoon?", presented: [], shared: false });
    expect(res).toMatchObject({ ok: true, kind: "reply" });
    if (res.ok) expect(res.text).toContain("packing delivery");
  });

  it("unlocks and voices new knowledge when evidence is presented", async () => {
    const state = started();
    const res = await ask(pack, state, new ScriptedProvider(), { character: "marina", asker: "a", question: "Why did you change the registry?", presented: ["c02"], shared: true });
    expect(res).toMatchObject({ ok: true, newly: ["marina_registry_lie"] });
    if (res.ok) expect(res.text).toContain("Paul asked me");
    expect(state.flags.has("marina_alerted")).toBe(true);
  });

  it("never lets a model voice locked knowledge", async () => {
    const llm = new LeakyProvider();
    const res = await ask(pack, started(), llm, { character: "marina", asker: "a", question: "You took it, admit it!", presented: [], shared: false });
    expect(res).toMatchObject({ ok: true, kind: "reply", text: "I've told you what I know." });
    expect(llm.calls.filter((c) => c.tier === "strong")).toHaveLength(2); // one retry, then the safe line
    const prompt = llm.calls.find((c) => c.tier === "strong")!.messages.map((m) => m.content).join("\n");
    expect(prompt).not.toContain("I took it");
  });

  it("refuses callers without the character's number", async () => {
    const res = await ask(pack, started(), new ScriptedProvider(), { character: "oliver", asker: "a", question: "Hi", presented: [], shared: false });
    expect(res).toMatchObject({ ok: false });
  });

  it("shows a speakerphone exchange to everyone and a private one only to the asker", async () => {
    const state = started();
    const llm = new ScriptedProvider();
    await ask(pack, state, llm, { character: "paul", asker: "a", question: "Where were you?", presented: [], shared: false });
    await ask(pack, state, llm, { character: "paul", asker: "b", question: "Why the revaluation?", presented: [], shared: true });
    expect(viewFor(pack, state, "a", 0)!.calls.paul).toHaveLength(2);
    expect(viewFor(pack, state, "c", 0)!.calls.paul).toHaveLength(1);
  });
});

import { missingOriginal } from "@neo/case-missing-original";
import { CasePackSchema } from "@neo/case-schema";
import { apply, createGame, type GameState } from "@neo/engine";
import { describe, expect, it } from "vitest";
import { ask } from "../dialogue";
import { ScriptedProvider } from "./scripted";

const pack = CasePackSchema.parse(missingOriginal);

function started(): GameState {
  const state = createGame(pack);
  for (const id of ["a", "b", "c"]) apply(pack, state, { type: "join", player: id, name: id.toUpperCase() }, 0);
  apply(pack, state, { type: "start" }, 0);
  return state;
}

async function talk(state: GameState, questions: string[], presented: string[][] = []) {
  const llm = new ScriptedProvider();
  const out: string[] = [];
  for (const [i, q] of questions.entries()) {
    const res = await ask(pack, state, llm, { character: "marina", asker: "a", question: q, presented: presented[i] ?? [], shared: true }, i * 1000);
    out.push(res.ok ? res.text : res.error);
  }
  return out;
}

describe("ScriptedProvider", () => {
  it("greets, then answers different questions with different approved lines", async () => {
    const replies = await talk(started(), ["hello", "what did you do after lunch?", "when did you leave?", "and what about Paul's revaluation?"]);
    expect(replies[0]).toMatch(/^Hello\. Marina speaking/);
    expect(new Set(replies).size).toBe(replies.length);
    expect(replies[2]).toContain("left around seven");
    expect(replies[3]).toContain("revaluation");
  });

  it("doesn't repeat itself verbatim when it has nothing new", async () => {
    const replies = await talk(started(), ["and?", "and?", "and?", "and?", "and?", "and?"]);
    for (let i = 1; i < replies.length; i++) expect(replies[i]).not.toBe(replies[i - 1]);
  });

  it("says what the engine just unlocked first", async () => {
    const replies = await talk(started(), ["hello", "anything to say about this?"], [[], ["c02"]]);
    expect(replies[1]).toContain("Paul asked me");
  });
});

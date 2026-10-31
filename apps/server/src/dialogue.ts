import type { CasePack } from "@neo/case-schema";
import {
  characterMessages,
  checkReply,
  classifierMessages,
  memoryOf,
  parseClassification,
  planTurn,
  recordReply,
  slotsOf,
  type GameState,
} from "@neo/engine";
import { ScriptedProvider, type LlmProvider } from "./llm";
import type { Character, Knowledge } from "@neo/case-schema";

export interface AskInput {
  character: string;
  asker: string;
  question: string;
  presented: string[];
  shared: boolean;
}

export type AskResult =
  | { ok: true; kind: "reply" | "refuse" | "unavailable" | "end" | "council"; text: string; newly: string[] }
  | { ok: false; error: string };

// One question in, one line out:
// classify → contract engine → role-play on unlocked knowledge only → check.
export async function ask(pack: CasePack, state: GameState, llm: LlmProvider, input: AskInput, now = Date.now()): Promise<AskResult> {
  const character = pack.characters.find((c) => c.id === input.character);
  const asker = state.players.find((p) => p.id === input.asker);
  if (!character || !asker) return { ok: false, error: "Unknown character." };
  const question = input.question.trim().slice(0, 500);
  if (!question && input.presented.length === 0) return { ok: false, error: "Say something." };

  const mySlots = slotsOf(pack, state, asker.id);
  const contacts = new Set(pack.slots.filter((s) => mySlots.includes(s.id)).flatMap((s) => s.contacts));
  if (!contacts.has(character.id)) return { ok: false, error: `You don't have ${character.name}'s number.` };

  const said = question || `(shows ${input.presented.length} item${input.presented.length === 1 ? "" : "s"})`;
  const audience = input.shared ? "all" : [asker.id];
  const turn = (topics: string[], accusatory: boolean) => ({ character: character.id, asker: asker.id, topics, accusatory, presented: input.presented });
  const roleplay = (active: Knowledge[], newly: Knowledge[], presented: string[], s: GameState) =>
    speak(llm, { pack, character, active, presented, memory: memoryOf(s, character.id), askerName: asker.name, question: said }, newly);

  // Latency: the model's classification and its reply are both slow, so the
  // reply is drafted in parallel on a throwaway copy of the state, planned
  // from an instant keyword classification. If the model's classification
  // leads to the same unlocked knowledge — the usual case — the draft is used.
  const quick = question ? await keywordClassification(character, question) : { topics: [], accusatory: false };
  const classified = question
    ? llm
        .complete({ tier: "fast", messages: classifierMessages(character, question), json: true, maxTokens: 120 })
        .then((raw) => parseClassification(raw, character))
        .catch(() => quick)
    : Promise.resolve(quick);
  const draftState = structuredClone(state);
  const draftPlan = planTurn(pack, draftState, turn(quick.topics, quick.accusatory), now);
  const draft = draftPlan.kind === "reply" ? roleplay(draftPlan.active, draftPlan.newly, draftPlan.presented, draftState) : undefined;
  draft?.catch(() => undefined); // a failed draft is simply not used

  const classification = await classified;
  const plan = planTurn(pack, state, turn(classification.topics, classification.accusatory), now);

  if (plan.kind !== "reply") {
    recordReply(state, character.id, asker.id, said, plan.line, audience, now);
    return { ok: true, kind: plan.kind, text: plan.line, newly: [] };
  }

  const sameKnowledge =
    draftPlan.kind === "reply" &&
    draftPlan.active.map((k) => k.id).join() === plan.active.map((k) => k.id).join() &&
    draftPlan.presented.join() === plan.presented.join();
  const text = (sameKnowledge && draft ? await draft.catch(() => undefined) : undefined) ?? (await roleplay(plan.active, plan.newly, plan.presented, state));

  recordReply(state, character.id, asker.id, said, text, audience, now);
  return { ok: true, kind: "reply", text, newly: plan.newly.map((k) => k.id) };
}

const keywords = new ScriptedProvider();
async function keywordClassification(character: Character, question: string) {
  return parseClassification(await keywords.complete({ tier: "fast", messages: classifierMessages(character, question), json: true }), character);
}

// Role-play on the approved knowledge only, check, retry once, then fall back.
async function speak(llm: LlmProvider, ctx: Parameters<typeof characterMessages>[0], newly: Knowledge[]): Promise<string> {
  const messages = characterMessages(ctx);
  const allowed = new Set(ctx.active.map((k) => k.id));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const check = checkReply(await llm.complete({ tier: "strong", messages, json: true, maxTokens: 220 }), allowed);
      if (check.ok) return check.reply;
    } catch {
      // Network or model error: try once more, then fall back.
    }
  }
  // Safe fallback: the newest approved line verbatim, else a non-answer.
  return newly[newly.length - 1]?.says ?? "I've told you what I know.";
}

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
import type { LlmProvider } from "./llm";

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

  const classification = question
    ? parseClassification(await llm.complete({ tier: "fast", messages: classifierMessages(character, question), json: true, maxTokens: 120 }), character)
    : { topics: [], accusatory: false };

  const plan = planTurn(pack, state, { character: character.id, asker: asker.id, topics: classification.topics, accusatory: classification.accusatory, presented: input.presented }, now);
  const audience = input.shared ? "all" : [asker.id];
  const said = question || `(shows ${input.presented.length} item${input.presented.length === 1 ? "" : "s"})`;

  if (plan.kind !== "reply") {
    recordReply(state, character.id, asker.id, said, plan.line, audience, now);
    return { ok: true, kind: plan.kind, text: plan.line, newly: [] };
  }

  const messages = characterMessages({
    pack,
    character,
    active: plan.active,
    presented: plan.presented,
    memory: memoryOf(state, character.id),
    askerName: asker.name,
    question: said,
  });
  const allowed = new Set(plan.active.map((k) => k.id));

  let text: string | undefined;
  for (let attempt = 0; attempt < 2 && !text; attempt++) {
    const check = checkReply(await llm.complete({ tier: "strong", messages, json: true, maxTokens: 220 }), allowed);
    if (check.ok) text = check.reply;
  }
  // Safe fallback: the newest approved line verbatim, else a non-answer.
  text ??= plan.newly[plan.newly.length - 1]?.says ?? "I've told you what I know.";

  recordReply(state, character.id, asker.id, said, text, audience, now);
  return { ok: true, kind: "reply", text, newly: plan.newly.map((k) => k.id) };
}

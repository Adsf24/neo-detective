import type { CasePack, Character, Knowledge } from "@neo/case-schema";
import { evaluate, type ConditionContext } from "./conditions";
import { type GameState, slotsOf, worldContext } from "./game";

// The contract engine decides, before the LLM says a word, what a character
// is willing to say on this turn. The model only ever receives the result.

export interface CharacterMemory {
  presented: Set<string>;
  asked: Set<string>; // topics ever raised with this character
  admitted: Set<string>; // knowledge entries already said
  pressure: number;
  cooldownUntil: number;
  history: { asker: string; question: string; reply: string; at: number; audience: "all" | string[]; delivery?: string }[];
}

export function memoryOf(state: GameState, character: string): CharacterMemory {
  let m = state.characters.get(character);
  if (!m) {
    m = { presented: new Set(), asked: new Set(), admitted: new Set(), pressure: 0, cooldownUntil: 0, history: [] };
    state.characters.set(character, m);
  }
  return m;
}

export interface TurnInput {
  character: string;
  asker: string; // player id
  topics: string[]; // from the classifier, already filtered to this character's topics
  accusatory: boolean; // pushing for a confession
  presented: string[]; // items shown on this turn
}

export type TurnPlan =
  | { kind: "refuse"; line: string }
  | { kind: "unavailable"; line: string }
  | { kind: "end"; line: string }
  | {
      kind: "reply";
      character: Character;
      active: Knowledge[]; // everything the character may say now
      newly: Knowledge[]; // entries unlocked by this turn
      presented: string[]; // all items this character has been shown
    };

function dialogueContext(state: GameState, mem: CharacterMemory, askerSlot: string, now: number): ConditionContext {
  return {
    ...worldContext(state, now),
    dialogue: { presented: mem.presented, askedAbout: mem.asked, askedBy: askerSlot, admitted: mem.admitted },
  };
}

// Evaluate to a fixed point: admitting one entry can unlock another
// (a confession enables "where is it" on the same turn only if asked).
function activeKnowledge(character: Character, ctx: ConditionContext, mem: CharacterMemory): Knowledge[] {
  for (;;) {
    const active = character.knowledge.filter((k) => evaluate(k.unlock, ctx));
    const before = mem.admitted.size;
    for (const k of active) mem.admitted.add(k.id);
    if (mem.admitted.size === before) return active;
  }
}

export function planTurn(pack: CasePack, state: GameState, input: TurnInput, now: number): TurnPlan {
  const character = pack.characters.find((c) => c.id === input.character);
  const player = state.players.find((p) => p.id === input.asker);
  if (!character || !player) return { kind: "refuse", line: "The line is dead." };

  const askerSlots = slotsOf(pack, state, input.asker);
  if (character.talksTo !== "all" && !character.talksTo.some((s) => askerSlots.includes(s))) {
    return { kind: "refuse", line: character.refusal };
  }

  const mem = memoryOf(state, character.id);
  if (now < mem.cooldownUntil) return { kind: "unavailable", line: `${character.name} isn't answering right now.` };

  const known = new Set(character.topics.map((t) => t.id));
  for (const t of input.topics) if (known.has(t)) mem.asked.add(t);
  for (const item of input.presented) mem.presented.add(item);

  const before = new Set(mem.admitted);
  const active = activeKnowledge(character, dialogueContext(state, mem, player.slot, now), mem);
  const newly = active.filter((k) => !before.has(k.id));

  for (const k of newly) for (const f of k.setsFlags) state.flags.add(f);
  for (const k of newly) state.log.push({ at: now, player: input.asker, type: "admit", detail: { character: character.id, knowledge: k.id } });
  for (const item of input.presented) state.log.push({ at: now, player: input.asker, type: "present", detail: { character: character.id, item } });

  // Pushing without anything new to show wears the witness down.
  if (input.accusatory && newly.length === 0 && input.presented.length === 0) {
    mem.pressure += 1;
    if (mem.pressure >= character.pressure.limit) {
      mem.pressure = 0;
      mem.cooldownUntil = now + character.pressure.cooldownMinutes * 60_000;
      state.log.push({ at: now, player: input.asker, type: "hang_up", detail: { character: character.id } });
      return { kind: "end", line: character.pressure.endLine };
    }
  } else if (newly.length > 0 || input.presented.length > 0) {
    mem.pressure = 0;
  }

  return { kind: "reply", character, active, newly, presented: [...mem.presented] };
}

// `audience` is everyone in the room for a speakerphone call, else just the asker.
export function recordReply(
  state: GameState,
  character: string,
  asker: string,
  question: string,
  reply: string,
  audience: "all" | string[],
  now: number,
  delivery?: string,
) {
  memoryOf(state, character).history.push({ asker, question, reply, at: now, audience, delivery });
  state.log.push({ at: now, player: asker, type: "ask", detail: { character, question } });
}

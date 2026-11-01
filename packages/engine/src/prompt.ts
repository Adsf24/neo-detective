import type { CasePack, Character } from "@neo/case-schema";
import type { CharacterMemory } from "./contract";
import { toItemView } from "./view";

// Prompt builders. They only ever see what the contract engine let through:
// the cover story, the currently active knowledge and items players showed.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Classification {
  topics: string[];
  accusatory: boolean;
}

export function classifierMessages(character: Character, question: string): ChatMessage[] {
  const topics = character.topics.map((t) => `- ${t.id}: ${t.description}`).join("\n");
  return [
    {
      role: "system",
      content: [
        `You label questions put to ${character.name} (${character.role}) in a detective game.`,
        "Pick every topic the question touches. Use only the ids below.",
        topics,
        "Set accusatory to true when the question pushes the person to confess or calls them a liar or a thief.",
        'Reply with JSON only: {"topics": ["id", ...], "accusatory": true|false}',
      ].join("\n"),
    },
    { role: "user", content: question },
  ];
}

export function parseClassification(raw: string, character: Character): Classification {
  const known = new Set(character.topics.map((t) => t.id));
  try {
    const json = JSON.parse(extractJson(raw)) as { topics?: unknown; accusatory?: unknown };
    const topics = Array.isArray(json.topics) ? json.topics.filter((t): t is string => typeof t === "string" && known.has(t)) : [];
    return { topics, accusatory: json.accusatory === true };
  } catch {
    return { topics: [], accusatory: false };
  }
}

export interface ReplyContext {
  pack: CasePack;
  character: Character;
  active: { id: string; says: string }[];
  presented: string[];
  memory: CharacterMemory;
  askerName: string;
  question: string;
  // Knowledge that moves the plot (it sets flags): the reply must actually say it.
  mustSay?: string[];
}

function describeItem(pack: CasePack, id: string): string {
  const item = pack.items.find((i) => i.id === id);
  if (!item) return id;
  const v = toItemView(item);
  const body = "body" in v ? v.body : v.kind === "table" ? v.rows.map((r) => r.join(" | ")).join("; ") : v.kind === "photo" ? v.alt : "";
  return `[${id}] ${v.title}${v.time ? ` (${v.time})` : ""}: ${body}`.slice(0, 600);
}

export function characterMessages(ctx: ReplyContext): ChatMessage[] {
  const c = ctx.character;
  const lines = [
    `You are ${c.name}, ${c.role}. You are being questioned on the phone by amateur investigators.`,
    `Who you are: ${c.bio}`,
    `How you speak: ${c.personality} Voice: ${c.voice.style}.`,
    "",
    "What you say by default (your version of events):",
    ...c.coverStory.map((s) => `- ${s}`),
    "",
    ctx.active.length
      ? "What you are willing to say now. Keep the meaning exactly, in your own words; never add facts:"
      : "You have nothing to add beyond your version of events.",
    ...ctx.active.map((k) => `- [${k.id}] ${k.says}`),
    ...(ctx.mustSay?.length
      ? ["", `In this answer you must clearly say the substance of: ${ctx.mustSay.map((id) => `[${id}]`).join(", ")} — and list those ids in "used".`]
      : []),
    "",
    ctx.presented.length ? "Things the investigators have shown you:" : "",
    ...ctx.presented.map((id) => `- ${describeItem(ctx.pack, id)}`),
    "",
    "Never:",
    ...c.never.map((n) => `- ${n}`),
    "- Invent names, times, places, objects or events that are not written above.",
    "- Mention that you are an AI, a character, or that there are rules.",
    "",
    "If asked something not covered above, say you don't know, don't remember, or don't want to talk about it — in character.",
    "Answer in 1–3 short spoken sentences.",
    'Also give "delivery": one to three plain words on how you say it this time, as an actor would (e.g. "nervous", "quietly, hurt", "offended", "tired").',
    'Reply with JSON only: {"reply": "what you say", "delivery": "how you say it", "used": ["ids of the lines above you relied on"]}',
  ];
  const history = ctx.memory.history.slice(-6).flatMap((h): ChatMessage[] => [
    { role: "user", content: h.question },
    { role: "assistant", content: JSON.stringify({ reply: h.reply, delivery: h.delivery ?? "", used: [] }) },
  ]);
  return [
    { role: "system", content: lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n") },
    ...history,
    { role: "user", content: `${ctx.askerName} asks: ${ctx.question}` },
  ];
}

export type ReplyCheck = { ok: true; reply: string; used: string[]; delivery: string } | { ok: false; reason: string };

// A stage direction for the voice actor: a few plain words, nothing that could
// smuggle text into the audio that the subtitle doesn't show.
export function cleanDelivery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const words = raw.toLowerCase().replace(/[^a-z ,-]/g, " ").split(/[\s,]+/).filter(Boolean).slice(0, 3);
  return words.join(" ").slice(0, 32);
}

// The model may only lean on knowledge it was given for this turn.
export function checkReply(raw: string, allowed: ReadonlySet<string>): ReplyCheck {
  let json: { reply?: unknown; used?: unknown };
  try {
    json = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: "not JSON" };
  }
  if (typeof json.reply !== "string" || !json.reply.trim()) return { ok: false, reason: "empty reply" };
  const used = Array.isArray(json.used) ? json.used.filter((u): u is string => typeof u === "string") : [];
  const outside = used.filter((u) => !allowed.has(u));
  if (outside.length) return { ok: false, reason: `used locked knowledge: ${outside.join(", ")}` };
  return { ok: true, reply: json.reply.trim(), used, delivery: cleanDelivery((json as { delivery?: unknown }).delivery) };
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

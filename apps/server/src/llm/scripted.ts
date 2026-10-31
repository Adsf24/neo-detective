import type { ChatMessage } from "@neo/engine";
import type { CompletionRequest, LlmProvider } from "./provider";

// Offline stand-in for development, tests and a no-network demo. It never
// invents anything: it picks among the lines the contract engine already
// approved (cover story and unlocked knowledge), matching them to the
// question by shared words and avoiding repeats. Wooden, but playable.

const ACCUSATORY = /\b(you took|you stole|you swapped|admit|confess|liar|lying|thief|it was you)\b/i;
const GREETING = /^\s*(hi|hello|hey|good (morning|afternoon|evening)|hiya)\b[\s!.,?]*\w{0,12}[\s!.?]*$/i;
const STOP = new Set(["what", "when", "where", "which", "about", "there", "their", "were", "with", "that", "this", "have", "your", "you're", "would", "could", "should", "then", "them", "they", "from", "just", "tell", "know", "does", "did"]);
const DEFLECT = [
  "I've told you what I know about that.",
  "I'm not sure what else you want me to say.",
  "Could you be more specific?",
  "I don't really know anything more.",
];

export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";

  async complete(req: CompletionRequest): Promise<string> {
    const system = req.messages[0]?.content ?? "";
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    if (system.includes("You label questions")) return JSON.stringify(classify(system, last));
    return JSON.stringify(reply(req.messages));
  }
}

const stems = (text: string) =>
  new Set((text.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)));

function classify(system: string, question: string) {
  const q = stems(question);
  const topics: string[] = [];
  for (const line of system.split("\n")) {
    const m = /^- ([a-z0-9_-]+): (.+)$/.exec(line);
    if (!m) continue;
    if ([...stems(m[2]!)].some((w) => q.has(w))) topics.push(m[1]!);
  }
  return { topics, accusatory: ACCUSATORY.test(question) };
}

interface Line {
  id?: string; // knowledge id when the line is unlocked knowledge
  text: string;
}

function section(system: string, header: RegExp): string[] {
  const start = system.search(header);
  if (start < 0) return [];
  const rest = system.slice(start).split("\n").slice(1);
  const out: string[] = [];
  for (const l of rest) {
    if (!l.startsWith("- ")) break;
    out.push(l.slice(2));
  }
  return out;
}

function reply(messages: ChatMessage[]) {
  const system = messages[0]?.content ?? "";
  const name = /^You are ([^,]+),/.exec(system)?.[1] ?? "";
  const question = (messages[messages.length - 1]?.content ?? "").replace(/^.*? asks: /, "");
  const said = messages
    .filter((m) => m.role === "assistant")
    .map((m) => {
      try {
        return String((JSON.parse(m.content) as { reply?: string }).reply ?? "");
      } catch {
        return m.content;
      }
    });
  const alreadySaid = (text: string) => said.some((s) => s.includes(text));

  if (GREETING.test(question) && !said.some((s) => s.startsWith("Hello."))) {
    return { reply: `Hello. ${name.split(" ")[0] ?? ""} speaking. What is this about?`.replace("  ", " "), used: [] };
  }

  const cover: Line[] = section(system, /^What you say by default/m).map((text) => ({ text }));
  const knowledge: Line[] = section(system, /^What you are willing to say now/m)
    .map((l) => /^\[([a-z0-9_-]+)\] (.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ id: m[1], text: m[2]! }));

  const q = stems(question);
  const score = (l: Line) => {
    const overlap = [...stems(l.text)].filter((w) => q.has(w)).length;
    return overlap * 3 + (l.id ? 2 : 0) + (alreadySaid(l.text) ? -4 : 0);
  };
  const ranked = [...knowledge, ...cover].sort((a, b) => score(b) - score(a));
  const best = ranked[0];
  const matched = best && [...stems(best.text)].some((w) => q.has(w));

  // Something new that the engine just unlocked always comes out first.
  const fresh = knowledge.find((k) => !alreadySaid(k.text));
  if (fresh && (!matched || !best || alreadySaid(best.text) || !best.id)) {
    return { reply: fresh.text, used: [fresh.id!] };
  }
  if (best && matched) {
    return alreadySaid(best.text)
      ? { reply: `As I said — ${lowerFirst(best.text)}`, used: best.id ? [best.id] : [] }
      : { reply: best.text, used: best.id ? [best.id] : [] };
  }
  const unsaidCover = cover.find((c) => !alreadySaid(c.text));
  if (unsaidCover) return { reply: unsaidCover.text, used: [] };
  return { reply: DEFLECT[said.length % DEFLECT.length]!, used: [] };
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

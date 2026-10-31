import type { CompletionRequest, LlmProvider } from "./provider";

// Offline stand-in for development, tests and a no-network demo. It is
// deliberately dumb: keyword topics for the classifier, and replies built
// from the lines the contract engine already approved.

const ACCUSATORY = /\b(you took|you stole|you swapped|admit|confess|liar|lying|thief|it was you)\b/i;

export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";

  async complete(req: CompletionRequest): Promise<string> {
    const system = req.messages[0]?.content ?? "";
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    if (system.includes("You label questions")) return JSON.stringify(classify(system, last));
    return JSON.stringify(reply(system));
  }
}

function classify(system: string, question: string) {
  const q = question.toLowerCase();
  const topics: string[] = [];
  for (const line of system.split("\n")) {
    const m = /^- ([a-z0-9_-]+): (.+)$/.exec(line);
    if (!m) continue;
    const words = m[2]!.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    if (words.some((w) => q.includes(w))) topics.push(m[1]!);
  }
  return { topics, accusatory: ACCUSATORY.test(question) };
}

function reply(system: string) {
  const knowledge = [...system.matchAll(/^- \[([a-z0-9_-]+)\] (.+)$/gm)].filter(
    (m) => !system.slice(0, m.index).includes("Things the investigators have shown you"),
  );
  if (knowledge.length) {
    const last = knowledge[knowledge.length - 1]!;
    return { reply: last[2], used: [last[1]] };
  }
  const cover = /your version of events\):\n- (.+)/.exec(system);
  return { reply: cover?.[1] ?? "I don't know anything about that.", used: [] };
}

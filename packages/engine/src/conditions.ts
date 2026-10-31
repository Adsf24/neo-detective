import type { Condition } from "@neo/case-schema";

// Everything a condition can look at. World predicates always apply; the
// dialogue block is present only while a character is answering a question,
// so dialogue predicates are false everywhere else.
export interface ConditionContext {
  flags: ReadonlySet<string>;
  board: ReadonlySet<string>;
  minutesElapsed: number;
  dialogue?: {
    presented: ReadonlySet<string>;
    askedAbout: ReadonlySet<string>;
    askedBy?: string;
    admitted: ReadonlySet<string>;
  };
}

export function evaluate(c: Condition, ctx: ConditionContext): boolean {
  if ("all" in c) return c.all.every((x) => evaluate(x, ctx));
  if ("any" in c) return c.any.some((x) => evaluate(x, ctx));
  if ("not" in c) return !evaluate(c.not, ctx);
  if ("always" in c) return true;
  if ("flag" in c) return ctx.flags.has(c.flag);
  if ("onBoard" in c) return ctx.board.has(c.onBoard);
  if ("minutesElapsed" in c) return ctx.minutesElapsed >= c.minutesElapsed;
  const d = ctx.dialogue;
  if (!d) return false;
  if ("presented" in c) return d.presented.has(c.presented);
  if ("askedAbout" in c) return d.askedAbout.has(c.askedAbout);
  if ("askedBy" in c) return d.askedBy === c.askedBy;
  if ("admitted" in c) return d.admitted.has(c.admitted);
  return false;
}

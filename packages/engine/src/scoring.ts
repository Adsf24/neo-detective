import type { CasePack, Claim } from "@neo/case-schema";
import type { GameState } from "./game";

// Scoring reads only the case's evidence graph: a name without a chain is a
// guess, and the game says so.

export interface ClaimResult {
  id: string;
  statement: string;
  sources: string[]; // sources fully covered by the chosen items
  proven: boolean;
}

export interface Score {
  culprit: boolean;
  motive: boolean;
  claims: ClaimResult[];
  missingGroups: string[][]; // required claim groups with nothing proven
  proof: "full" | "partial" | "none";
  outcome: "solved" | "right_unproven" | "wrong";
}

function claimResult(c: Claim, items: ReadonlySet<string>, min: number): ClaimResult {
  const sources = c.sources.filter((s) => s.items.every((i) => items.has(i))).map((s) => s.id);
  return { id: c.id, statement: c.statement, sources, proven: sources.length >= min };
}

export function scoreAccusation(pack: CasePack, who: string, chosen: string[]): Score {
  const items = new Set(chosen);
  const rule = pack.accusation;
  const claims = pack.claims.map((c) => claimResult(c, items, rule.minSourcesPerClaim));
  const proven = new Set(claims.filter((c) => c.proven).map((c) => c.id));

  const missingGroups = rule.requiredClaims.filter((g) => !g.some((id) => proven.has(id)));
  const motive = rule.motiveClaims.some((id) => proven.has(id));
  const culprit = who === rule.culprit;

  const groups = rule.requiredClaims.length;
  const covered = groups - missingGroups.length;
  const proof = covered === groups && motive ? "full" : covered > 0 ? "partial" : "none";
  const outcome = !culprit ? "wrong" : proof === "full" ? "solved" : "right_unproven";

  return { culprit, motive, claims, missingGroups, proof, outcome };
}

export function scoreGame(pack: CasePack, state: GameState): Score | null {
  return state.accusation ? scoreAccusation(pack, state.accusation.who, state.accusation.items) : null;
}

import type { CasePack } from "@neo/case-schema";
import type { GameState } from "./game";

// The story of this particular team, assembled from the action log. It is
// what makes a replayed case feel like a different evening.

export interface TeamHistory {
  highlights: string[];
  missed: string[]; // key evidence the team never put on the Board
}

export function teamHistory(pack: CasePack, state: GameState): TeamHistory {
  const name = (id?: string) => state.players.find((p) => p.id === id)?.name ?? "Someone";
  const charName = (id?: string) => pack.characters.find((c) => c.id === id)?.name ?? "someone";
  const itemTitle = (id?: string) => pack.items.find((i) => i.id === id)?.title ?? "an item";
  const minute = (at: number) => (state.startedAt === null ? 0 : Math.max(0, Math.round((at - state.startedAt) / 60_000)));
  const culprit = pack.accusation.culprit;
  const knowledge = new Map(pack.characters.flatMap((c) => c.knowledge.map((k) => [k.id, { ...k, character: c.id }] as const)));
  const highlights: string[] = [];

  const firstPost = state.log.find((l) => l.type === "post");
  if (firstPost) highlights.push(`Minute ${minute(firstPost.at)}: ${name(firstPost.player)} put the first piece on the Board — ${itemTitle(firstPost.detail.item)}.`);

  const firstRight = state.versions.find((v) => v.who === culprit);
  if (firstRight) highlights.push(`Minute ${minute(firstRight.at)}: the team first named ${charName(culprit)} in its working version.`);
  else if (state.versions.length) highlights.push(`The team's working version pointed at ${charName(state.versions[0]!.who)}.`);

  const admits = state.log.filter((l) => l.type === "admit" && knowledge.get(l.detail.knowledge ?? "")?.character === culprit);
  const firstLie = admits.find((l) => knowledge.get(l.detail.knowledge!)?.truthful === false);
  if (firstLie) {
    const shown = state.log.find((l) => l.type === "present" && l.at === firstLie.at && l.detail.character === culprit);
    highlights.push(
      `Minute ${minute(firstLie.at)}: ${name(firstLie.player)} got ${charName(culprit)} to lie${shown ? ` by showing ${itemTitle(shown.detail.item)}` : ""}.`,
    );
  }
  const firstTruth = admits.find((l) => {
    const k = knowledge.get(l.detail.knowledge!);
    return k?.truthful === true && k.setsFlags.length > 0;
  });
  if (firstTruth) highlights.push(`Minute ${minute(firstTruth.at)}: ${name(firstTruth.player)} asked the question that broke ${charName(culprit)}.`);

  const hangUps = state.log.filter((l) => l.type === "hang_up").length;
  if (hangUps) highlights.push(`Witnesses hung up on the team ${hangUps} time${hangUps === 1 ? "" : "s"}.`);

  const councils = state.councils.filter((c) => c.status === "approved").length;
  if (councils) highlights.push(`${councils} irreversible move${councils === 1 ? " was" : "s were"} agreed by two detectives.`);

  const onBoard = new Set(state.board.map((b) => b.item));
  const required = new Set(pack.accusation.requiredClaims.flat().concat(pack.accusation.motiveClaims));
  const keyItems = new Set(pack.claims.filter((c) => required.has(c.id)).flatMap((c) => c.sources.flatMap((s) => s.items)));
  const missed = [...keyItems].filter((i) => !onBoard.has(i) && pack.items.some((x) => x.id === i)).map(itemTitle);

  return { highlights, missed };
}

import type { CasePack, Item } from "@neo/case-schema";
import { teamHistory, type TeamHistory } from "./history";
import { scoreGame, type Score } from "./scoring";
import {
  type BoardCard,
  type Council,
  type Version,
  type GameState,
  type InboxMessage,
  type Note,
  containerOpen,
  containerVisible,
  itemVisible,
  searchGate,
  slotsOf,
} from "./game";

// What one player is allowed to see. This projection is the security boundary
// between the engine and the client: truth, facts, character knowledge,
// passwords, flags and evidence links never cross it.

export type ItemView =
  | { id: string; container: string; title: string; time?: string; sortAt?: string; kind: "mail"; from: string; to: string; body: string; attachments: string[] }
  | { id: string; container: string; title: string; time?: string; sortAt?: string; kind: "document"; body: string }
  | { id: string; container: string; title: string; time?: string; sortAt?: string; kind: "table"; columns: string[]; rows: string[][] }
  | {
      id: string;
      container: string;
      title: string;
      time?: string;
      sortAt?: string;
      kind: "photo";
      src: string;
      caption: string;
      alt: string;
      exif: { author: string; takenAt: string };
      hotspots: { id: string; label: string; x: number; y: number; w: number; h: number; minZoom: number }[];
    }
  | { id: string; container: string; title: string; time?: string; sortAt?: string; kind: "finding"; body: string };

export interface ContainerView {
  id: string;
  kind: string;
  title: string;
  parent?: string;
  locked: boolean;
  needsCouncil: boolean; // a search that needs a second detective
}

export interface ContactView {
  id: string;
  name: string;
  role: string;
  channel: "voice" | "text";
  voice: { gender: "female" | "male"; style: string };
}

export interface CallLine {
  asker: string;
  question: string;
  reply: string;
  at: number;
  shared: boolean;
}

export interface CouncilView {
  id: string;
  requestedBy: string;
  summary: string;
  risk: string;
  status: "open" | "approved" | "declined" | "cancelled";
}

export interface DebriefView {
  accusation: { by: string; who: string; what: string; why: string; items: string[] };
  score: Score;
  culpritName: string;
  reconstruction: { narrator: string; text: string; reveals: string[] };
  history: TeamHistory;
}

export interface PlayerView {
  caseId: string;
  title: string;
  phase: GameState["phase"];
  act: { id: string; title: string };
  startedAt: number | null;
  me: { id: string; name: string; slot: string; slotLabel: string; intro: string };
  players: { id: string; name: string; slot: string }[];
  briefing: { title: string; text: string };
  containers: ContainerView[];
  items: ItemView[];
  folder: string[];
  contacts: ContactView[];
  board: BoardCard[];
  notes: Note[];
  inbox: InboxMessage[];
  trash: Record<string, string>; // trashed item -> its trash record, for items the player can see
  calls: Record<string, CallLine[]>; // character -> lines this player heard
  suspects: { id: string; name: string; role: string }[]; // everyone a version may name
  transition: { toAct: string; title: string } | null;
  versions: Version[];
  verdictRequested: boolean;
  councils: CouncilView[]; // open requests plus the last few decisions
  verdict: { open: boolean; voted: string[]; mine?: string; revealed: Record<string, string> | null };
  debrief: DebriefView | null; // the truth, only once the game is over
}

export function toItemView(item: Item): ItemView {
  const base = { id: item.id, container: item.container, title: item.title, time: item.time?.label, sortAt: item.time?.at };
  switch (item.kind) {
    case "mail":
      return { ...base, kind: "mail", from: item.from, to: item.to, body: item.body, attachments: item.attachments };
    case "document":
      return { ...base, kind: "document", body: item.body };
    case "table":
      return { ...base, kind: "table", columns: item.columns, rows: item.rows };
    case "photo":
      return {
        ...base,
        kind: "photo",
        src: item.src,
        caption: item.caption,
        alt: item.alt,
        exif: item.exif,
        hotspots: item.hotspots.map(({ id, label, x, y, w, h, minZoom }) => ({ id, label, x, y, w, h, minZoom })),
      };
    case "finding":
      return { ...base, kind: "finding", body: item.body };
  }
}

function councilSummary(pack: CasePack, c: Council): string {
  const title = (id: string) => pack.items.find((i) => i.id === id)?.title ?? id;
  const p = c.payload;
  if (p.kind === "present") {
    const name = pack.characters.find((x) => x.id === p.character)?.name ?? p.character;
    return `Show ${p.presented.map(title).join(", ")} to ${name}`;
  }
  return `Search ${pack.containers.find((x) => x.id === p.container)?.title ?? "the location"}`;
}

export function viewFor(pack: CasePack, state: GameState, playerId: string, now: number): PlayerView | null {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const mySlots = slotsOf(pack, state, playerId);
  const slot = pack.slots.find((s) => s.id === me.slot)!;
  const act = pack.acts.find((a) => a.id === state.act)!;
  const playing = state.phase !== "lobby";

  const containers: ContainerView[] = playing
    ? pack.containers
        .filter((c) => containerVisible(pack, state, playerId, c, now))
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          title: c.title,
          parent: c.parent,
          locked: !containerOpen(pack, state, playerId, c, now),
          needsCouncil: !!searchGate(pack, state, c.id),
        }))
    : [];

  const items = playing ? pack.items.filter((i) => itemVisible(pack, state, playerId, i, now)).map(toItemView) : [];
  const visible = new Set(items.map((i) => i.id));

  const contactIds = new Set(pack.slots.filter((s) => mySlots.includes(s.id)).flatMap((s) => s.contacts));
  const contacts = playing
    ? pack.characters
        .filter((c) => contactIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, role: c.role, channel: c.channel, voice: c.voice }))
    : [];

  return {
    caseId: pack.meta.id,
    title: pack.meta.title,
    phase: state.phase,
    act: { id: act.id, title: act.title },
    startedAt: state.startedAt,
    me: { id: me.id, name: me.name, slot: me.slot, slotLabel: slot.label, intro: playing ? slot.intro : "" },
    players: state.players.map((p) => ({ id: p.id, name: p.name, slot: p.slot })),
    briefing: playing ? pack.briefing : { title: pack.meta.title, text: "" },
    containers,
    items,
    folder: playing ? [...(state.folders.get(playerId) ?? [])] : [],
    contacts,
    board: [...state.board],
    notes: [...state.notes],
    inbox: [...(state.inbox.get(playerId) ?? [])],
    trash: Object.fromEntries([...state.trashed].filter(([, record]) => visible.has(record))),
    suspects: pack.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })),
    transition: state.transition
      ? { toAct: state.transition.toAct, title: pack.acts.find((a) => a.id === state.transition!.toAct)?.title ?? "" }
      : null,
    versions: [...state.versions],
    verdictRequested: state.verdictRequested,
    councils: state.councils.slice(-5).map((c) => ({
      id: c.id,
      requestedBy: c.requestedBy,
      summary: councilSummary(pack, c),
      risk: pack.irreversible.find((r) => r.id === c.irreversible)?.risk ?? "",
      status: c.status,
    })),
    verdict: {
      open: state.verdict.open,
      voted: [...state.verdict.votes.keys()],
      mine: state.verdict.votes.get(playerId),
      revealed: state.verdict.revealed ? Object.fromEntries(state.verdict.votes) : null,
    },
    debrief:
      state.phase === "finished" && state.accusation
        ? {
            accusation: state.accusation,
            score: scoreGame(pack, state)!,
            culpritName: pack.characters.find((c) => c.id === pack.accusation.culprit)!.name,
            reconstruction: {
              narrator: pack.characters.find((c) => c.id === pack.reconstruction.narrator)!.name,
              text: pack.reconstruction.text,
              reveals: pack.reconstruction.reveals,
            },
            history: teamHistory(pack, state),
          }
        : null,
    calls: Object.fromEntries(
      [...state.characters].map(([id, mem]) => [
        id,
        mem.history
          .filter((h) => h.audience === "all" || h.audience.includes(playerId))
          .map((h) => ({ asker: h.asker, question: h.question, reply: h.reply, at: h.at, shared: h.audience === "all" })),
      ]),
    ),
  };
}

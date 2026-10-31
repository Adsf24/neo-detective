import type { CasePack, Container, Item } from "@neo/case-schema";
import { evaluate, type ConditionContext } from "./conditions";
import type { CharacterMemory } from "./contract";

// Authoritative game state for one room. All mutations go through `apply`,
// which validates the action against the case pack and returns an error
// string instead of throwing, so the server can relay it to the player.

export interface Player {
  id: string;
  name: string;
  slot: string;
}

export interface BoardCard {
  item: string;
  postedBy: string;
  note?: string;
  at: number;
}

export interface Note {
  id: string;
  author: string;
  text: string;
  at: number;
}

export interface InboxMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}

export interface LogEntry {
  at: number;
  player?: string;
  type: string;
  detail: Record<string, string | undefined>;
}

export interface Version {
  act: string;
  author: string;
  who: string;
  what: string;
  why: string;
  items: string[];
  at: number;
}

export type CouncilPayload =
  | { kind: "present"; character: string; question: string; presented: string[]; shared: boolean }
  | { kind: "search"; container: string };

export interface Council {
  id: string;
  irreversible: string;
  requestedBy: string;
  payload: CouncilPayload;
  status: "open" | "approved" | "declined" | "cancelled";
  decidedBy?: string;
  at: number;
}

export interface Accusation {
  by: string;
  who: string;
  what: string;
  why: string;
  items: string[];
  at: number;
}

export interface GameState {
  phase: "lobby" | "playing" | "finished";
  startedAt: number | null;
  act: string;
  players: Player[];
  flags: Set<string>;
  revealed: Set<string>;
  trashed: Map<string, string>; // item -> trash record
  unlocked: Map<string, Set<string>>; // player -> containers opened with a password
  folders: Map<string, string[]>; // player -> personal item ids
  inbox: Map<string, InboxMessage[]>;
  board: BoardCard[];
  notes: Note[];
  characters: Map<string, CharacterMemory>;
  // Director
  fired: Set<string>;
  pending: { event: string; dueAt: number }[];
  transition: { toAct: string; since: number } | null;
  versions: Version[];
  verdictRequested: boolean;
  // Finale
  verdict: { open: boolean; votes: Map<string, string>; revealed: boolean };
  accusation: Accusation | null;
  // Council
  councils: Council[];
  approved: Set<string>; // irreversible ids approved for the rest of the game (searches)
  log: LogEntry[];
  seq: number;
}

export type Action =
  | { type: "join"; player: string; name: string }
  | { type: "start" }
  | { type: "unlock"; player: string; container: string; password: string }
  | { type: "open"; player: string; item: string }
  | { type: "post"; player: string; item: string; note?: string }
  | { type: "send"; player: string; item: string; to: string }
  | { type: "note"; player: string; text: string }
  | { type: "hotspot"; player: string; item: string; hotspot: string }
  | { type: "version"; player: string; who: string; what: string; why: string; items: string[] }
  | { type: "councilRequest"; player: string; payload: CouncilPayload }
  | { type: "councilDecide"; player: string; council: string; approve: boolean }
  | { type: "councilCancel"; player: string; council: string }
  | { type: "callVerdict"; player: string }
  | { type: "vote"; player: string; who: string }
  | { type: "accuse"; player: string; who: string; what: string; why: string; items: string[] };

export type ApplyResult = { ok: true } | { ok: false; error: string };

export function createGame(pack: CasePack): GameState {
  return {
    phase: "lobby",
    startedAt: null,
    act: pack.acts[0]!.id,
    players: [],
    flags: new Set(),
    revealed: new Set(),
    trashed: new Map(),
    unlocked: new Map(),
    folders: new Map(),
    inbox: new Map(),
    board: [],
    notes: [],
    characters: new Map(),
    fired: new Set(),
    pending: [],
    transition: null,
    versions: [],
    verdictRequested: false,
    verdict: { open: false, votes: new Map(), revealed: false },
    accusation: null,
    councils: [],
    approved: new Set(),
    log: [],
    seq: 0,
  };
}

export function minutesElapsed(state: GameState, now: number): number {
  return state.startedAt === null ? 0 : (now - state.startedAt) / 60_000;
}

export function worldContext(state: GameState, now: number): ConditionContext {
  return {
    flags: state.flags,
    board: new Set(state.board.map((c) => c.item)),
    minutesElapsed: minutesElapsed(state, now),
  };
}

// Slots a player stands for, including slots merged into theirs at this player count.
export function slotsOf(pack: CasePack, state: GameState, playerId: string): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const merged = pack.slotMerges
    .filter((m) => m.players === state.players.length && m.into === player.slot)
    .map((m) => m.from);
  return [player.slot, ...merged];
}

export function containerVisible(pack: CasePack, state: GameState, playerId: string, c: Container, now: number): boolean {
  if (c.kind === "personal") return true;
  if (c.access !== "all" && !c.access.some((s) => slotsOf(pack, state, playerId).includes(s))) return false;
  if (c.unlockedBy && !evaluate(c.unlockedBy, worldContext(state, now))) return false;
  if (c.parent) {
    const parent = pack.containers.find((p) => p.id === c.parent);
    if (!parent || !containerOpen(pack, state, playerId, parent, now)) return false;
  }
  return true;
}

export function containerOpen(pack: CasePack, state: GameState, playerId: string, c: Container, now: number): boolean {
  if (!containerVisible(pack, state, playerId, c, now)) return false;
  return !c.password || (state.unlocked.get(playerId)?.has(c.id) ?? false);
}

export function itemVisible(pack: CasePack, state: GameState, playerId: string, item: Item, now: number): boolean {
  if (state.board.some((b) => b.item === item.id)) return true;
  if (state.folders.get(playerId)?.includes(item.id)) return true;
  if (item.hidden && !state.revealed.has(item.id)) return false;
  if (state.trashed.has(item.id)) return false;
  const container = pack.containers.find((c) => c.id === item.container);
  if (!container || container.kind === "personal") return false;
  if (searchGate(pack, state, container.id)) return false;
  return containerOpen(pack, state, playerId, container, now);
}

function log(state: GameState, now: number, type: string, player: string | undefined, detail: LogEntry["detail"]) {
  state.log.push({ at: now, player, type, detail });
}

function nextId(state: GameState, prefix: string): string {
  state.seq += 1;
  return `${prefix}${state.seq}`;
}

export function apply(pack: CasePack, state: GameState, action: Action, now: number): ApplyResult {
  const fail = (error: string): ApplyResult => ({ ok: false, error });

  if (action.type === "join") {
    const existing = state.players.find((p) => p.id === action.player);
    if (existing) {
      existing.name = action.name;
      return { ok: true };
    }
    if (state.phase !== "lobby") return fail("The investigation has already started.");
    if (state.players.length >= pack.meta.players.max) return fail("This room is full.");
    const slot = pack.slots[state.players.length]!.id;
    state.players.push({ id: action.player, name: action.name, slot });
    log(state, now, "join", action.player, { slot });
    return { ok: true };
  }

  if (action.type === "start") {
    if (state.phase !== "lobby") return fail("Already started.");
    if (state.players.length < pack.meta.players.min) return fail(`Need at least ${pack.meta.players.min} players.`);
    state.phase = "playing";
    state.startedAt = now;
    for (const p of state.players) {
      const mine = slotsOf(pack, state, p.id);
      const items = pack.slots.filter((s) => mine.includes(s.id)).flatMap((s) => s.items);
      state.folders.set(p.id, [...items]);
      state.inbox.set(p.id, []);
      state.unlocked.set(p.id, new Set());
    }
    log(state, now, "start", undefined, { players: String(state.players.length) });
    return { ok: true };
  }

  if (state.phase !== "playing") return fail("The investigation hasn't started yet.");
  if (!state.players.some((p) => p.id === action.player)) return fail("Unknown player.");

  switch (action.type) {
    case "unlock": {
      const c = pack.containers.find((x) => x.id === action.container);
      if (!c || !containerVisible(pack, state, action.player, c, now)) return fail("Nothing to unlock here.");
      if (!c.password) return { ok: true };
      if (action.password.trim() !== c.password) {
        log(state, now, "unlock_failed", action.player, { container: c.id });
        return fail("Wrong password.");
      }
      state.unlocked.get(action.player)!.add(c.id);
      log(state, now, "unlock", action.player, { container: c.id });
      return { ok: true };
    }
    case "open": {
      const item = pack.items.find((i) => i.id === action.item);
      if (!item || !itemVisible(pack, state, action.player, item, now)) return fail("You can't see that.");
      log(state, now, "open", action.player, { item: item.id });
      return { ok: true };
    }
    case "post": {
      const item = pack.items.find((i) => i.id === action.item);
      if (!item || !itemVisible(pack, state, action.player, item, now)) return fail("You can't see that.");
      if (state.board.some((b) => b.item === item.id)) return fail("Already on the Board.");
      const note = action.note?.trim() || undefined;
      state.board.push({ item: item.id, postedBy: action.player, note, at: now });
      log(state, now, "post", action.player, { item: item.id, note });
      return { ok: true };
    }
    case "send": {
      const item = pack.items.find((i) => i.id === action.item);
      if (!item || !itemVisible(pack, state, action.player, item, now)) return fail("You can't see that.");
      const folder = state.folders.get(action.to);
      if (!folder) return fail("Unknown player.");
      if (!folder.includes(item.id)) folder.push(item.id);
      log(state, now, "send", action.player, { item: item.id, to: action.to });
      return { ok: true };
    }
    case "note": {
      const text = action.text.trim();
      if (!text) return fail("Empty note.");
      state.notes.push({ id: nextId(state, "n"), author: action.player, text: text.slice(0, 500), at: now });
      log(state, now, "note", action.player, { text });
      return { ok: true };
    }
    case "version": {
      if (!state.transition) return fail("No version is being recorded right now.");
      if (!pack.characters.some((c) => c.id === action.who)) return fail("Pick who did it.");
      const what = action.what.trim();
      const why = action.why.trim();
      if (!what || !why) return fail("Say what happened and why.");
      const onBoard = new Set(state.board.map((b) => b.item));
      const items = [...new Set(action.items)].filter((i) => onBoard.has(i));
      if (items.length === 0) return fail("Back your version with at least one item from the Board.");
      state.versions.push({ act: state.act, author: action.player, who: action.who, what: what.slice(0, 500), why: why.slice(0, 500), items, at: now });
      log(state, now, "version", action.player, { act: state.act, who: action.who });
      state.act = state.transition.toAct;
      state.transition = null;
      log(state, now, "act", undefined, { act: state.act });
      return { ok: true };
    }
    case "councilRequest": {
      const irreversible = councilNeeded(pack, state, action.payload);
      if (!irreversible) return fail("No council needed.");
      if (state.councils.some((c) => c.status === "open" && c.requestedBy === action.player)) {
        return fail("You already have a request waiting for a second detective.");
      }
      if (state.players.length < 2) return fail("A second detective is needed.");
      state.councils.push({ id: nextId(state, "c"), irreversible: irreversible.id, requestedBy: action.player, payload: action.payload, status: "open", at: now });
      log(state, now, "council_request", action.player, { irreversible: irreversible.id });
      return { ok: true };
    }
    case "councilDecide": {
      const c = state.councils.find((x) => x.id === action.council && x.status === "open");
      if (!c) return fail("That decision is no longer open.");
      if (c.requestedBy === action.player) return fail("Another detective has to decide.");
      c.status = action.approve ? "approved" : "declined";
      c.decidedBy = action.player;
      if (action.approve && c.payload.kind === "search") state.approved.add(c.irreversible);
      log(state, now, "council_decide", action.player, { council: c.id, approve: String(action.approve) });
      return { ok: true };
    }
    case "councilCancel": {
      const c = state.councils.find((x) => x.id === action.council && x.status === "open");
      if (!c || c.requestedBy !== action.player) return fail("Nothing to cancel.");
      c.status = "cancelled";
      return { ok: true };
    }
    case "callVerdict": {
      if (state.transition) return fail("Record the team's version first.");
      state.verdict.open = true;
      log(state, now, "verdict_called", action.player, {});
      return { ok: true };
    }
    case "vote": {
      if (!state.verdict.open) return fail("The verdict hasn't been called.");
      if (state.verdict.revealed) return fail("Votes are already revealed.");
      if (!pack.characters.some((c) => c.id === action.who)) return fail("Pick a person.");
      state.verdict.votes.set(action.player, action.who);
      if (state.verdict.votes.size === state.players.length) {
        state.verdict.revealed = true;
        log(state, now, "verdict_revealed", undefined, Object.fromEntries(state.verdict.votes));
      }
      return { ok: true };
    }
    case "accuse": {
      if (!state.verdict.revealed) return fail("Everyone votes first.");
      if (!pack.characters.some((c) => c.id === action.who)) return fail("Pick who did it.");
      const what = action.what.trim();
      const why = action.why.trim();
      if (!what || !why) return fail("Say what happened and why.");
      const onBoard = new Set(state.board.map((b) => b.item));
      const items = [...new Set(action.items)].filter((i) => onBoard.has(i));
      if (items.length < pack.accusation.minItems) return fail(`Back the accusation with at least ${pack.accusation.minItems} items from the Board.`);
      state.accusation = { by: action.player, who: action.who, what: what.slice(0, 800), why: why.slice(0, 500), items, at: now };
      state.phase = "finished";
      log(state, now, "accuse", action.player, { who: action.who });
      return { ok: true };
    }
    case "hotspot": {
      const item = pack.items.find((i) => i.id === action.item);
      if (!item || item.kind !== "photo" || !itemVisible(pack, state, action.player, item, now)) return fail("You can't see that.");
      const spot = item.hotspots.find((h) => h.id === action.hotspot);
      if (!spot) return fail("Nothing there.");
      if (spot.setsFlag) state.flags.add(spot.setsFlag);
      log(state, now, "hotspot", action.player, { item: item.id, hotspot: spot.id });
      return { ok: true };
    }
  }
}

// The irreversible action a move falls under, if it still needs a second detective.
export function councilNeeded(pack: CasePack, state: GameState, payload: CouncilPayload) {
  if (payload.kind === "present") {
    if (payload.presented.length === 0) return undefined;
    return pack.irreversible.find((r) => r.action.kind === "present" && r.action.character === payload.character);
  }
  return searchGate(pack, state, payload.container);
}

// A location that must not be searched without a second detective's consent.
export function searchGate(pack: CasePack, state: GameState, container: string) {
  return pack.irreversible.find(
    (r) => r.action.kind === "openContainer" && r.action.container === container && !state.approved.has(r.id),
  );
}

// Director-side mutations, used by events. Kept here so state invariants live in one place.
export function deliverMessage(state: GameState, to: string[] , from: string, text: string, now: number) {
  for (const id of to) {
    const box = state.inbox.get(id);
    if (box) box.push({ id: nextId(state, "m"), from, text, at: now });
  }
}

export function trashItem(state: GameState, item: string, trashRecord: string) {
  state.trashed.set(item, trashRecord);
  state.revealed.add(trashRecord);
}

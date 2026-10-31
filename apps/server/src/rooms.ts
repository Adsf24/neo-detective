import type { CasePack } from "@neo/case-schema";
import {
  apply,
  councilNeeded,
  createGame,
  itemVisible,
  tick,
  viewFor,
  type Action,
  type ApplyResult,
  type GameState,
  type PlayerView,
} from "@neo/engine";
import { ask, type AskResult } from "./dialogue";
import type { LlmProvider } from "./llm";

export interface Room {
  code: string;
  pack: CasePack;
  state: GameState;
  lastActive: number;
  asks: number[]; // timestamps of recent questions, for the per-minute limit
  askTotal: number;
  busy: Set<string>; // players waiting for an answer
}

// Credit guard. A public link must not be able to burn the model budget.
export const LIMITS = {
  askPerMinute: Number(process.env.LIMIT_ASK_PER_MINUTE ?? 30),
  askPerRoom: Number(process.env.LIMIT_ASK_PER_ROOM ?? 400),
  concurrent: Number(process.env.LIMIT_CONCURRENT_ASKS ?? 12),
  rooms: Number(process.env.LIMIT_ROOMS ?? 200),
  idleMs: Number(process.env.ROOM_IDLE_HOURS ?? 6) * 3_600_000,
};

export interface AskPayload {
  character: string;
  question: string;
  presented: string[];
  shared: boolean;
}

// In-memory rooms: a restart ends every game, which is acceptable for the MVP.
// Rooms also orchestrate what spans engine and LLM: the Council in front of
// an irreversible presentation, and the director tick after every change.
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private inFlight = 0;

  constructor(
    private readonly pack: CasePack,
    private readonly llm: LlmProvider,
  ) {}

  get(code: string, now = Date.now()): Room {
    let room = this.rooms.get(code);
    if (!room) {
      this.evict(now);
      room = { code, pack: this.pack, state: createGame(this.pack), lastActive: now, asks: [], askTotal: 0, busy: new Set() };
      this.rooms.set(code, room);
    }
    room.lastActive = now;
    return room;
  }

  // Drop rooms nobody has touched for a while, and the oldest if still full.
  private evict(now: number) {
    for (const [code, r] of this.rooms) if (now - r.lastActive > LIMITS.idleMs) this.rooms.delete(code);
    while (this.rooms.size >= LIMITS.rooms) {
      const oldest = [...this.rooms.values()].sort((a, b) => a.lastActive - b.lastActive)[0]!;
      this.rooms.delete(oldest.code);
    }
  }

  codes(): string[] {
    return [...this.rooms.keys()];
  }

  tick(code: string, now = Date.now()): string[] {
    const room = this.get(code);
    return tick(room.pack, room.state, now);
  }

  async act(code: string, action: Action, now = Date.now()): Promise<ApplyResult> {
    const room = this.get(code);
    const res = apply(room.pack, room.state, action, now);
    if (res.ok && action.type === "councilDecide" && action.approve) {
      // An approved presentation goes ahead in the requester's name.
      const council = room.state.councils.find((c) => c.id === action.council);
      if (council?.payload.kind === "present") {
        const { character, question, presented, shared } = council.payload;
        await ask(room.pack, room.state, this.llm, { character, question, presented, shared, asker: council.requestedBy }, now);
      }
    }
    if (res.ok) tick(room.pack, room.state, now);
    return res;
  }

  async ask(code: string, player: string, payload: AskPayload, now = Date.now()): Promise<AskResult> {
    const room = this.get(code, now);
    if (room.busy.has(player)) return { ok: false, error: "Wait for the answer first." };
    room.asks = room.asks.filter((t) => now - t < 60_000);
    if (room.asks.length >= LIMITS.askPerMinute) return { ok: false, error: "The line is busy. Give it a few seconds." };
    if (room.askTotal >= LIMITS.askPerRoom) return { ok: false, error: "This case has used up its calls. Time to accuse." };
    if (this.inFlight >= LIMITS.concurrent) return { ok: false, error: "All lines are busy. Try again in a moment." };
    room.asks.push(now);
    room.askTotal += 1;
    room.busy.add(player);
    this.inFlight += 1;
    try {
      return await this.askUnguarded(room, player, payload, now);
    } finally {
      room.busy.delete(player);
      this.inFlight -= 1;
    }
  }

  private async askUnguarded(room: Room, player: string, payload: AskPayload, now: number): Promise<AskResult> {
    const presented = payload.presented.filter((id) => {
      const item = room.pack.items.find((i) => i.id === id);
      return item && itemVisible(room.pack, room.state, player, item, now);
    });
    const request = { ...payload, presented };

    if (room.state.players.length > 1 && councilNeeded(room.pack, room.state, { kind: "present", ...request })) {
      const res = apply(room.pack, room.state, { type: "councilRequest", player, payload: { kind: "present", ...request } }, now);
      if (!res.ok) return res;
      return { ok: true, kind: "council", text: "Showing this can't be undone. Waiting for a second detective to agree.", newly: [] };
    }

    const res = await ask(room.pack, room.state, this.llm, { ...request, asker: player }, now);
    if (res.ok) tick(room.pack, room.state, now);
    return res;
  }

  views(code: string, now = Date.now()): Map<string, PlayerView> {
    const room = this.get(code);
    const out = new Map<string, PlayerView>();
    for (const p of room.state.players) {
      const v = viewFor(room.pack, room.state, p.id, now);
      if (v) out.set(p.id, v);
    }
    return out;
  }
}

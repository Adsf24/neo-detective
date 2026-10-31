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
}

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

  constructor(
    private readonly pack: CasePack,
    private readonly llm: LlmProvider,
  ) {}

  get(code: string): Room {
    let room = this.rooms.get(code);
    if (!room) {
      room = { code, pack: this.pack, state: createGame(this.pack) };
      this.rooms.set(code, room);
    }
    return room;
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
    const room = this.get(code);
    const presented = payload.presented.filter((id) => {
      const item = room.pack.items.find((i) => i.id === id);
      return item && itemVisible(room.pack, room.state, player, item, now);
    });
    const request = { ...payload, presented };

    if (councilNeeded(room.pack, room.state, { kind: "present", ...request })) {
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

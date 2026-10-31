import type { CasePack } from "@neo/case-schema";
import { apply, createGame, viewFor, type Action, type ApplyResult, type GameState, type PlayerView } from "@neo/engine";

export interface Room {
  code: string;
  pack: CasePack;
  state: GameState;
}

// In-memory rooms: a restart ends every game, which is acceptable for the MVP.
export class Rooms {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly pack: CasePack) {}

  get(code: string): Room {
    let room = this.rooms.get(code);
    if (!room) {
      room = { code, pack: this.pack, state: createGame(this.pack) };
      this.rooms.set(code, room);
    }
    return room;
  }

  act(code: string, action: Action, now = Date.now()): ApplyResult {
    const room = this.get(code);
    return apply(room.pack, room.state, action, now);
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

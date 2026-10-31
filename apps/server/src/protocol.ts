import type { Action, ApplyResult, PlayerView } from "@neo/engine";

// Socket event contract shared with the client.

type WithoutPlayer<T> = T extends { player: string } ? Omit<T, "player"> : T;

// Actions a client may send; the server fills in the player from the socket.
export type ClientAction = WithoutPlayer<Exclude<Action, { type: "join" }>>;

export type JoinResult = { ok: true; player: string } | { ok: false; error: string };

export interface ClientToServer {
  join: (payload: { room: string; name: string; player: string }, ack: (res: JoinResult) => void) => void;
  act: (action: ClientAction, ack: (res: ApplyResult) => void) => void;
}

export interface ServerToClient {
  view: (view: PlayerView) => void;
}

export type { PlayerView };

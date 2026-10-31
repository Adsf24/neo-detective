import type { Member } from "@neo/engine";

// Socket event contract shared with the client.
export interface ClientToServer {
  join: (payload: { room: string; name: string }) => void;
}

export interface ServerToClient {
  presence: (members: Member[]) => void;
}

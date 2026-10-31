import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../../server/src/protocol";

type Member = Parameters<ServerToClient["presence"]>[0][number];

function roomFromUrl(): string {
  return new URLSearchParams(window.location.search).get("room") ?? "lobby";
}

export function App() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const room = roomFromUrl();

  useEffect(() => {
    if (!joined) return;
    const socket: Socket<ServerToClient, ClientToServer> = io();
    socket.on("presence", setMembers);
    socket.on("connect", () => socket.emit("join", { room, name }));
    return () => {
      socket.disconnect();
    };
  }, [joined, room, name]);

  if (!joined) {
    return (
      <main className="screen">
        <h1>NEO Detective</h1>
        <p className="muted">Room: {room}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setJoined(true);
          }}
        >
          <input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Join</button>
        </form>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1>Room {room}</h1>
      <ul aria-label="Players">
        {members.map((m) => (
          <li key={m.id}>{m.name}</li>
        ))}
      </ul>
    </main>
  );
}

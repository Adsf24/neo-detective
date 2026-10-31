import type { ApplyResult, PlayerView } from "@neo/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientAction, ClientToServer, JoinResult, ServerToClient } from "../../server/src/protocol";

type GameSocket = Socket<ServerToClient, ClientToServer>;

// A stable id per browser so a refresh rejoins as the same player.
function playerId(): string {
  const key = "neo.player";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function savedName(): string {
  try {
    return localStorage.getItem("neo.name") ?? "";
  } catch {
    return "";
  }
}

export function useGame(room: string) {
  const socketRef = useRef<GameSocket | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [name, setName] = useState(savedName);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(playerId()).current;

  useEffect(() => {
    const socket: GameSocket = io();
    socketRef.current = socket;
    socket.on("view", setView);
    socket.on("connect", () => {
      // Rejoin automatically after a reconnect or refresh.
      const n = savedName();
      if (n) socket.emit("join", { room, name: n, player: id }, (res: JoinResult) => setJoined(res.ok));
    });
    return () => {
      socket.disconnect();
    };
  }, [room, id]);

  const join = useCallback(
    (n: string) => {
      setError(null);
      socketRef.current?.emit("join", { room, name: n, player: id }, (res: JoinResult) => {
        if (res.ok) {
          try {
            localStorage.setItem("neo.name", n);
          } catch {
            // Storage may be blocked; the session still works without it.
          }
          setName(n);
          setJoined(true);
        } else setError(res.error);
      });
    },
    [room, id],
  );

  const act = useCallback(
    (action: ClientAction) =>
      new Promise<ApplyResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve({ ok: false, error: "Not connected." });
        socket.emit("act", action, (res) => {
          if (!res.ok) setError(res.error);
          else setError(null);
          resolve(res);
        });
      }),
    [],
  );

  return { view, name, joined, error, join, act, clearError: () => setError(null) };
}

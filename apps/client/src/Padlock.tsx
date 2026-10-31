import type { ApplyResult } from "@neo/engine";
import { useState } from "react";
import type { ClientAction } from "../../server/src/protocol";
import { buzz, play } from "./fx";

// A brass padlock in front of a password-protected container. A wrong
// password rattles it; the right one is animated by the parent once the
// server confirms (the lock pops open as the container unlocks).
export function Padlock({ container, act }: { container: string; act: (a: ClientAction) => Promise<ApplyResult> }) {
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(0);
  return (
    <div className="lockbox">
      <LockIcon key={shake} state={shake ? "rattle" : "closed"} />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ type: "unlock", container, password }).then((r) => {
            if (r.ok) {
              play("unlock");
              buzz([12, 40, 20]);
            } else {
              play("rattle");
              buzz([30, 40, 30]);
              setShake((n) => n + 1);
            }
          });
        }}
      >
        <input aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <button type="submit" className="brass">
          Unlock
        </button>
      </form>
    </div>
  );
}

export function LockIcon({ state }: { state: "closed" | "rattle" | "opening" }) {
  return (
    <svg className={`padlock padlock-${state}`} viewBox="0 0 64 80" aria-hidden="true">
      <defs>
        <linearGradient id="brass-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dd96" />
          <stop offset="0.5" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#7d5f22" />
        </linearGradient>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6d665e" />
          <stop offset="0.5" stopColor="#d9d3c8" />
          <stop offset="1" stopColor="#5c564f" />
        </linearGradient>
      </defs>
      <path className="shackle" d="M18 36 V22 a14 14 0 0 1 28 0 V36" fill="none" stroke="url(#steel)" strokeWidth="7" strokeLinecap="round" />
      <rect x="8" y="34" width="48" height="40" rx="7" fill="url(#brass-body)" stroke="#5a4315" strokeWidth="1.5" />
      <rect x="12" y="38" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.35)" />
      <circle cx="32" cy="52" r="5" fill="#2a1b0a" />
      <path d="M30 55 h4 l1.5 10 h-7 z" fill="#2a1b0a" />
    </svg>
  );
}

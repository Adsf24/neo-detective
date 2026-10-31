import type { ContactView, ItemView, PlayerView } from "@neo/engine";
import { useEffect, useRef, useState } from "react";
import type { AskResult } from "../../server/src/protocol";

interface Props {
  contact: ContactView;
  view: PlayerView;
  items: Map<string, ItemView>;
  ask: (payload: { character: string; question: string; presented: string[]; shared: boolean }) => Promise<AskResult>;
  onClose: () => void;
  playerName: (id: string) => string;
}

export function CallScreen({ contact, view, items, ask, onClose, playerName }: Props) {
  const [question, setQuestion] = useState("");
  const [shared, setShared] = useState(true);
  const [presenting, setPresenting] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = view.calls[contact.id] ?? [];
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void end.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, waiting]);

  // Evidence can come from the Board or from anything this player can see.
  const presentable = view.items;

  const send = async () => {
    if (!question.trim() && presenting.length === 0) return;
    setWaiting(true);
    setError(null);
    const res = await ask({ character: contact.id, question, presented: presenting, shared });
    setWaiting(false);
    if (!res.ok) return setError(res.error);
    setQuestion("");
    setPresenting([]);
  };

  return (
    <div className="app call">
      <header className="topbar">
        <button className="link-button" onClick={onClose}>
          ← Hang up
        </button>
        <span>{contact.name}</span>
      </header>
      <main className="content transcript" aria-label="Transcript">
        <p className="muted small">{contact.role}</p>
        {lines.map((l, i) => (
          <div key={i} className="exchange">
            <p className="q">
              <span className="muted small">{playerName(l.asker)}{l.shared ? " · speaker" : ""}</span>
              <br />
              {l.question}
            </p>
            <p className="a">{l.reply}</p>
          </div>
        ))}
        {waiting && <p className="a muted">…</p>}
        <div ref={end} />
      </main>

      <footer className="composer">
        {presenting.length > 0 && (
          <p className="small">
            Showing:{" "}
            {presenting.map((id) => (
              <button key={id} className="chip" onClick={() => setPresenting((p) => p.filter((x) => x !== id))}>
                {items.get(id)?.title ?? id} ×
              </button>
            ))}
          </p>
        )}
        {picking && (
          <ul className="list picker" aria-label="Evidence to show">
            {presentable.map((i) => (
              <li key={i.id}>
                <button
                  className="row-button"
                  onClick={() => {
                    setPresenting((p) => (p.includes(i.id) ? p : [...p, i.id]));
                    setPicking(false);
                  }}
                >
                  {i.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <button type="button" aria-label="Show evidence" onClick={() => setPicking((p) => !p)}>
            📎
          </button>
          <input aria-label="Your question" placeholder={`Ask ${contact.name.split(" ")[0]}…`} value={question} onChange={(e) => setQuestion(e.target.value)} disabled={waiting} />
          <button type="submit" className="primary" disabled={waiting}>
            Ask
          </button>
        </form>
        <label className="small muted toggle">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Speakerphone — the whole team hears
        </label>
        {error && <p className="error">{error}</p>}
      </footer>
    </div>
  );
}

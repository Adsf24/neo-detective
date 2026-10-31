import type { ContactView, ItemView, PlayerView } from "@neo/engine";
import { useEffect, useRef, useState } from "react";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "./voice";
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
  const [notice, setNotice] = useState<string | null>(null);
  const lines = view.calls[contact.id] ?? [];
  const end = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const spoken = useRef(lines.length);

  // Replies are voiced on the phone of whoever asked — on speakerphone that
  // is the phone lying on the table.
  useEffect(() => {
    const fresh = lines.slice(spoken.current);
    spoken.current = lines.length;
    const mine = fresh.filter((l) => l.asker === view.me.id);
    const last = mine[mine.length - 1];
    if (last && !muted && contact.channel === "voice") speak(last.reply, contact.voice, contact.id);
  }, [lines, view.me.id, muted, contact]);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    void end.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, waiting]);

  // Evidence can come from the Board or from anything this player can see.
  const presentable = view.items;

  const send = async () => {
    if (!question.trim() && presenting.length === 0) return;
    setWaiting(true);
    setError(null);
    setNotice(null);
    const res = await ask({ character: contact.id, question, presented: presenting, shared });
    setWaiting(false);
    if (!res.ok) return setError(res.error);
    if (res.kind === "council") setNotice(res.text);
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
        {listening && <p className="small notice">Listening… release to stop</p>}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {contact.channel === "voice" && canListen() && (
            <button
              type="button"
              aria-label="Hold to talk"
              className={listening ? "mic on" : "mic"}
              onPointerDown={(e) => {
                e.preventDefault();
                stopSpeaking();
                setListening(true);
                stopListening.current = listen(
                  (text) => setQuestion(text),
                  () => setListening(false),
                  (msg) => setError(msg),
                );
              }}
              onPointerUp={() => stopListening.current?.()}
              onPointerLeave={() => listening && stopListening.current?.()}
            >
              🎙
            </button>
          )}
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
        {contact.channel === "voice" && canSpeak() && (
          <label className="small muted toggle">
            <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} /> Play {contact.name.split(" ")[0]}'s voice on this phone
          </label>
        )}
        {notice && <p className="small notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </footer>
    </div>
  );
}

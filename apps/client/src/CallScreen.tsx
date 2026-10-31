import type { ContactView, ItemView, PlayerView } from "@neo/engine";
import { useEffect, useRef, useState } from "react";
import { buzz, flash, play } from "./fx";
import { Icon } from "./Icons";
import { canListen, canRecord, canSpeak, listen, recordWav, speak, stopSpeaking, transcribe } from "./voice";
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
  const [push, setPush] = useState(0);
  const lines = view.calls[contact.id] ?? [];
  const end = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const recorder = useRef<Promise<{ stop: () => Promise<Blob> }> | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  // Chrome recognises speech itself, instantly; elsewhere the recording goes
  // to Muse Voice Transcribe through the server.
  const voiceMode = canListen() ? "browser" : canRecord() ? "muse" : null;
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
    // The witness gave something away: make the moment land.
    if (res.kind === "reply" && res.newly.length > 0) {
      setPush((n) => n + 1);
      play("reveal");
      buzz([20, 50, 40]);
      flash("gold");
    }
    if (res.kind === "end" || res.kind === "refuse") {
      play("stamp");
      buzz(40);
    }
    setQuestion("");
    setPresenting([]);
  };

  return (
    <div className="app call">
      <header className="topbar plate">
        <button className="link-button" onClick={onClose}>
          ← Hang up
        </button>
        <span className="plate-title">
          <span className="receiver" aria-hidden="true">☎</span> {contact.name}
        </span>
      </header>
      <main className="content transcript" aria-label="Transcript">
        {contact.portrait ? (
          <div className={`call-hero${push ? " push" : ""}`} key={push}>
            <div className="call-portrait" style={{ backgroundImage: `url(/${contact.portrait})` }} />
            <div className="call-caption">
              <span className="live-dot" aria-hidden="true" /> On the line
              <strong>{contact.name}</strong>
              <span className="muted small">{contact.role}</span>
            </div>
          </div>
        ) : (
          <div className="caller-card">
            <span className="medallion big" aria-hidden="true">
              {contact.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
            <p className="muted small">{contact.role}</p>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className="exchange">
            <p className="q">
              <span className="muted small">{playerName(l.asker)}{l.shared ? " · speaker" : ""}</span>
              <br />
              {l.question}
            </p>
            <p className="a ink-line">{l.reply}</p>
          </div>
        ))}
        {waiting && (
          <p className="a thinking" aria-label="Waiting for an answer">
            <span />
            <span />
            <span />
          </p>
        )}
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
        {transcribing && <p className="small notice">Transcribing…</p>}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {contact.channel === "voice" && voiceMode && (
            <button
              type="button"
              aria-label="Hold to talk"
              className={listening ? "mic on" : "mic"}
              disabled={transcribing}
              onPointerDown={(e) => {
                e.preventDefault();
                stopSpeaking();
                setListening(true);
                if (voiceMode === "browser") {
                  stopListening.current = listen(
                    (text) => setQuestion(text),
                    () => setListening(false),
                    (msg) => setError(msg),
                  );
                } else {
                  recorder.current = recordWav();
                  recorder.current.catch(() => {
                    setListening(false);
                    setError("Microphone access was refused. Type instead.");
                  });
                  stopListening.current = () => {
                    const pending = recorder.current;
                    recorder.current = null;
                    setListening(false);
                    if (!pending) return;
                    setTranscribing(true);
                    void pending
                      .then((r) => r.stop())
                      .then(transcribe)
                      .then((text) => setQuestion((q) => (q ? `${q} ${text}` : text)))
                      .catch((err: Error) => setError(err.message))
                      .finally(() => setTranscribing(false));
                  };
                }
              }}
              onPointerUp={() => stopListening.current?.()}
              onPointerLeave={() => listening && stopListening.current?.()}
            >
              <Icon name="mic" />
            </button>
          )}
          <button type="button" aria-label="Show evidence" onClick={() => setPicking((p) => !p)}>
            <Icon name="clip" />
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

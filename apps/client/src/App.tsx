import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Game } from "./Game";
import { useGame } from "./useGame";

function roomFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("room");
}

function newRoomCode(): string {
  const words = ["lumen", "ember", "quill", "raven", "slate", "amber", "cinder", "harbor"];
  const word = words[Math.floor(Math.random() * words.length)]!;
  return `${word}-${Math.floor(100 + Math.random() * 900)}`;
}

export function App() {
  const room = roomFromUrl();
  if (!room) return <Landing />;
  return <Room room={room} />;
}

function Landing() {
  const [code, setCode] = useState("");
  const go = (c: string) => {
    window.location.search = `?room=${encodeURIComponent(c.trim().toLowerCase())}`;
  };
  return (
    <main className="screen landing">
      <div className="title-card">
        <p className="eyebrow">NEO Detective · Case No. 1</p>
        <h1 className="display">The Missing Original</h1>
        <p className="tagline">A cooperative case for 3–4 detectives. Everyone plays on their own phone.</p>
      </div>
      <button className="primary wide" onClick={() => go(newRoomCode())}>
        Create a room
      </button>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) go(code);
        }}
      >
        <input aria-label="Room code" placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="submit">Join</button>
      </form>
    </main>
  );
}

function Room({ room }: { room: string }) {
  const game = useGame(room);
  const [name, setName] = useState(game.name);

  if (!game.joined || !game.view) {
    return (
      <main className="screen">
        <p className="eyebrow">Room {room}</p>
        <h1>Who's investigating?</h1>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) game.join(name.trim());
          }}
        >
          <input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary">
            Join
          </button>
        </form>
        {game.error && <p className="error">{game.error}</p>}
      </main>
    );
  }

  const view = game.view;
  if (view.phase === "lobby") {
    const link = window.location.href;
    return (
      <main className="screen">
        <p className="eyebrow">Room {room}</p>
        <h1 className="display">{view.title}</h1>
        <p className="muted">Scan to join, or share the link:</p>
        <Qr text={link} />
        <p className="link">{link}</p>
        <h2>Players</h2>
        <ul aria-label="Players" className="list roster">
          {view.players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.id === view.me.id && <span className="muted"> (you)</span>}
            </li>
          ))}
        </ul>
        <button className="primary wide" onClick={() => void game.act({ type: "start", demo: isDemo() })}>
          {isDemo() ? "Start (demo: skip ahead)" : "Start the investigation"}
        </button>
        {view.players.length < 3 && (
          <button className="wide" onClick={() => void game.act({ type: "start", demo: isDemo(), solo: true })}>
            Test alone — take every role
          </button>
        )}
        {game.error && <p className="error">{game.error}</p>}
      </main>
    );
  }

  return <Game view={view} act={game.act} ask={game.ask} error={game.error} clearError={game.clearError} />;
}

function isDemo(): boolean {
  return new URLSearchParams(window.location.search).has("demo");
}

function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    void QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#14110f", light: "#ece5d8" } }).then(setSvg);
  }, [text]);
  return <div className="qr" aria-label="QR code to join" role="img" dangerouslySetInnerHTML={{ __html: svg }} />;
}

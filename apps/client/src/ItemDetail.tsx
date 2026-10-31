import type { ApplyResult, ItemView, PlayerView } from "@neo/engine";
import { useRef, useState } from "react";
import { burst, buzz, flyTo, play } from "./fx";
import type { ClientAction } from "../../server/src/protocol";

interface Props {
  item: ItemView;
  view: PlayerView;
  act: (action: ClientAction) => Promise<ApplyResult>;
  onClose: () => void;
  playerName: (id: string) => string;
}

export function ItemDetail({ item, view, act, onClose, playerName }: Props) {
  const onBoard = view.board.find((c) => c.item === item.id);
  const [note, setNote] = useState("");
  const [sendTo, setSendTo] = useState("");
  const others = view.players.filter((p) => p.id !== view.me.id);
  const postButton = useRef<HTMLButtonElement>(null);

  return (
    <div className="app">
      <header className="topbar">
        <button className="link-button" onClick={onClose}>
          ← Back
        </button>
        <span className="board-chip" aria-label={`${view.board.length} on the Board`}>
          <span className="pin-mini" aria-hidden="true" />
          <span className="bump" key={view.board.length}>
            {view.board.length}
          </span>
        </span>
      </header>
      <main className="content detail">
        <h1 className="item-title">{item.title}</h1>
        <ItemBody item={item} act={act} />

        <section className="actions">
          {onBoard ? (
            <p className="pinned-note">
              <span className="pin-drop" aria-hidden="true" /> On the Board — posted by {playerName(onBoard.postedBy)}
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ type: "post", item: item.id, note }).then((r) => {
                  if (!r.ok || !postButton.current) return;
                  flyTo(postButton.current, ".board-chip", item.title);
                  setTimeout(() => {
                    play("pin");
                    buzz(15);
                  }, 520);
                });
              }}
            >
              <input
                aria-label="Why it matters"
                placeholder="Why it matters (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" className="primary wide" ref={postButton}>
                Post to Board
              </button>
            </form>
          )}
          {others.length > 0 && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (sendTo) void act({ type: "send", item: item.id, to: sendTo });
              }}
            >
              <select aria-label="Send to" value={sendTo} onChange={(e) => setSendTo(e.target.value)}>
                <option value="">Send privately to…</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="submit">Send</button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function ItemBody({ item, act }: { item: ItemView; act: Props["act"] }) {
  switch (item.kind) {
    case "mail":
      return (
        <article className="device mail">
          <p className="small">
            <span className="muted">From</span> {item.from}
            <br />
            <span className="muted">To</span> {item.to}
          </p>
          <Paragraphs text={item.body} />
          {item.attachments.length > 0 && <p className="muted small">📎 {item.attachments.join(", ")}</p>}
        </article>
      );
    case "document":
      return (
        <article className={item.container === "personal" ? "note-paper" : "device"}>
          <Paragraphs text={item.body} />
        </article>
      );
    case "finding":
      return (
        <article className="finding-card">
          <Paragraphs text={item.body} />
        </article>
      );
    case "table":
      return (
        <div className="device table-wrap">
          <table>
            <thead>
              <tr>
                {item.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "photo":
      return <Photo item={item} act={act} />;
  }
}

function Photo({ item, act }: { item: Extract<ItemView, { kind: "photo" }>; act: Props["act"] }) {
  const [zoom, setZoom] = useState(1);
  const [broken, setBroken] = useState(false);
  const [found, setFound] = useState<string[]>([]);

  return (
    <article>
      <div className="photo-frame">
        <div className="photo" style={{ transform: `scale(${zoom})` }}>
          {broken ? (
            <div className="photo-placeholder">{item.alt}</div>
          ) : (
            <img src={`/${item.src}`} alt={item.alt} onError={() => setBroken(true)} />
          )}
          {!broken &&
            item.marks.map((m, i) => (
              <span
                key={i}
                className={`mark mark-${m.style}`}
                style={{ left: `${m.x}%`, top: `${m.y}%`, fontSize: `${m.size}cqw`, transform: `translate(-50%, -50%) rotate(${m.rotate}deg)` }}
                aria-hidden="true"
              >
                {m.text}
              </span>
            ))}
          {item.hotspots.map((h) =>
            zoom >= h.minZoom ? (
              <button
                key={h.id}
                className="hotspot"
                aria-label="Inspect this detail"
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
                onClick={(e) => {
                  setFound((f) => (f.includes(h.id) ? f : [...f, h.id]));
                  burst(e.clientX, e.clientY, "spark");
                  play("sparkle");
                  buzz([8, 30, 8]);
                  void act({ type: "hotspot", item: item.id, hotspot: h.id });
                }}
              />
            ) : null,
          )}
        </div>
      </div>
      <label className="zoom">
        Zoom
        <input type="range" min={1} max={4} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      {found.map((id) => (
        <p key={id} className="finding">
          🔍 {item.hotspots.find((h) => h.id === id)?.label}
        </p>
      ))}
      <p className="muted small">
        {item.caption} · {item.exif.author}, {item.exif.takenAt}
      </p>
    </article>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((p, i) => (
        <p key={i} className="pre">
          {p}
        </p>
      ))}
    </>
  );
}

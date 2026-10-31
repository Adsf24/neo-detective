import type { ApplyResult, ItemView, PlayerView } from "@neo/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AskResult, ClientAction } from "../../server/src/protocol";
import { CallScreen } from "./CallScreen";
import { ActTransition, CouncilBanner } from "./Collective";
import { Debrief, Verdict } from "./Finale";
import { buzz, flash, isMuted, play, setMuted } from "./fx";
import { ItemDetail } from "./ItemDetail";
import { LockIcon, Padlock } from "./Padlock";

type Act = (action: ClientAction) => Promise<ApplyResult>;
type Tab = "world" | "board" | "inbox";

export interface GameProps {
  view: PlayerView;
  act: Act;
  ask: (payload: { character: string; question: string; presented: string[]; shared: boolean }) => Promise<AskResult>;
  error: string | null;
  clearError: () => void;
}

export function Game({ view, act, ask, error, clearError }: GameProps) {
  const [calling, setCalling] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("world");
  const [open, setOpen] = useState<string | null>(null);
  const [briefed, setBriefed] = useState(false);
  const items = useMemo(() => new Map(view.items.map((i) => [i.id, i])), [view.items]);
  const playerName = (id: string) => view.players.find((p) => p.id === id)?.name ?? "Someone";
  const toasts = useWorldReactions(view, playerName);

  if (!briefed) {
    return (
      <main className="screen briefing">
        <article className="letter">
          <p className="eyebrow">The case of</p>
          <h1 className="display">{view.title}</h1>
          <p className="dateline">{view.briefing.title}</p>
          {view.briefing.text.split("\n\n").map((p, i) => (
            <p key={i} className="ink" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
              {p}
            </p>
          ))}
          <span className="wax" aria-hidden="true">
            N
          </span>
        </article>
        <div className="private-note">
          <p className="eyebrow">For your eyes only — {view.me.slotLabel}</p>
          <p>{view.me.intro}</p>
        </div>
        <button className="primary wide" onClick={() => setBriefed(true)}>
          Start investigating
        </button>
      </main>
    );
  }

  if (view.debrief) return <Debrief view={view} items={items} playerName={playerName} />;

  const shared = (
    <>
      <CouncilBanner view={view} act={act} playerName={playerName} />
      <ActTransition view={view} items={items} act={act} />
      <Verdict view={view} items={items} act={act} playerName={playerName} />
      {view.verdictRequested && !view.verdict.open && (
        <button className="council wide-bar" onClick={() => void act({ type: "callVerdict" })}>
          Paul: “I need an answer.” — Call the verdict →
        </button>
      )}
    </>
  );

  // `shared` always sits first so the Council banner and the version form keep
  // their state while the player moves between screens.
  const contact = calling ? view.contacts.find((c) => c.id === calling) : undefined;
  const openItem = open ? items.get(open) : undefined;
  let screen;
  if (contact) {
    screen = <CallScreen contact={contact} view={view} items={items} ask={ask} onClose={() => setCalling(null)} playerName={playerName} />;
  } else if (openItem) {
    screen = <ItemDetail item={openItem} view={view} act={act} onClose={() => setOpen(null)} playerName={playerName} />;
  } else {
    screen = renderMain();
  }
  return (
    <>
      {shared}
      {screen}
      <Toasts toasts={toasts} />
    </>
  );

  function renderMain() {
    return (
    <div className="app">
      <header className="topbar plate">
        <span className="plate-title">{view.title}</span>
        <span className="topbar-right">
          <SoundToggle />
          <span className="act-ribbon" key={view.act.id}>
            {view.act.title}
          </span>
        </span>
      </header>
      {error && (
        <p className="error" role="alert" onClick={clearError}>
          {error}
        </p>
      )}
      <main className="content" key={tab}>
        {tab === "world" && <World view={view} items={items} act={act} onOpen={setOpen} onCall={setCalling} />}
        {tab === "board" && <Board view={view} items={items} act={act} onOpen={setOpen} playerName={playerName} />}
        {tab === "inbox" && <Inbox view={view} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        <button aria-pressed={tab === "world"} onClick={() => setTab("world")}>
          World <span className="tab-icon" aria-hidden="true">⌖</span>
        </button>
        <button aria-pressed={tab === "board"} onClick={() => setTab("board")}>
          Board{" "}
          <span className="badge bump" key={view.board.length}>
            {view.board.length}
          </span>
        </button>
        <button aria-pressed={tab === "inbox"} onClick={() => setTab("inbox")}>
          Inbox {view.inbox.length > 0 ? <span className="badge pulse">{view.inbox.length}</span> : <span className="tab-icon" aria-hidden="true">{"✉\uFE0E"}</span>}
        </button>
      </nav>
    </div>
    );
  }
}

// U+FE0E asks for the text glyph, not an emoji, on phones.
const KIND_GLYPH: Record<ItemView["kind"], string> = { mail: "✉\uFE0E", document: "§", table: "≡", photo: "◉", finding: "✦\uFE0E" };

function ItemRow({ item, onOpen, index = 0 }: { item: ItemView; onOpen: (id: string) => void; index?: number }) {
  return (
    <li className="deal" style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}>
      <button className={`row-button evidence kind-${item.kind}`} onClick={() => onOpen(item.id)}>
        <span className="glyph" aria-hidden="true">
          {KIND_GLYPH[item.kind]}
        </span>
        <span className="evidence-title">{item.title}</span>
        {item.time && <span className="stamp-time">{item.time}</span>}
      </button>
    </li>
  );
}

function World({
  view,
  items,
  act,
  onOpen,
  onCall,
}: {
  view: PlayerView;
  items: Map<string, ItemView>;
  act: Act;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
}) {
  const folder = view.folder.map((id) => items.get(id)).filter((i): i is ItemView => !!i);
  const { opening, revealed } = useContainerMoments(view);
  const top = view.containers.filter((c) => c.kind !== "personal" && !c.parent);
  const children = (id: string) => view.containers.filter((c) => c.parent === id);
  const inContainer = (id: string) =>
    view.items
      .filter((i) => i.container === id)
      .sort((a, b) => (a.sortAt ?? "").localeCompare(b.sortAt ?? ""));

  return (
    <>
      <section>
        <h2>Your materials</h2>
        <ul className="list">
          {folder.map((i, n) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} index={n} />
          ))}
        </ul>
      </section>

      {top.map((c) => (
        <section key={c.id} className={revealed.has(c.id) ? "doors-open" : undefined}>
          <h2>
            {c.kind === "computer" ? "⌨ " : c.kind === "gallery" ? "◉ " : c.kind === "location" ? "⚲ " : ""}
            {c.title}
          </h2>
          {c.needsCouncil ? (
            <button className="wide" onClick={() => void act({ type: "councilRequest", payload: { kind: "search", container: c.id } })}>
              Search — needs a second detective
            </button>
          ) : c.locked ? (
            <Padlock container={c.id} act={act} />
          ) : (
            <>
              {opening.has(c.id) && (
                <div className="lockbox opening" aria-hidden="true">
                  <LockIcon state="opening" />
                </div>
              )}
              <ul className="list">
                {inContainer(c.id).map((i, n) => (
                  <ItemRow key={i.id} item={i} onOpen={onOpen} index={n} />
                ))}
              </ul>
              {children(c.id).map((child) => (
                <details key={child.id} className="sub">
                  <summary>{child.title}</summary>
                  <ul className="list">
                    {inContainer(child.id).map((i, n) => (
                      <ItemRow key={i.id} item={i} onOpen={onOpen} index={n} />
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
        </section>
      ))}

      <section>
        <h2>People</h2>
        <ul className="list">
          {view.contacts.map((c) => (
            <li key={c.id} className="contact">
              <span className="medallion" aria-hidden="true">
                {c.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="contact-name">
                {c.name}
                <span className="muted small">{c.role}</span>
              </span>
              <button className="brass" onClick={() => onCall(c.id)}>
                {c.channel === "voice" ? "Call" : "Message"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Board({
  view,
  items,
  act,
  onOpen,
  playerName,
}: {
  view: PlayerView;
  items: Map<string, ItemView>;
  act: Act;
  onOpen: (id: string) => void;
  playerName: (id: string) => string;
}) {
  const [note, setNote] = useState("");
  const timeline = view.board
    .map((c) => items.get(c.item))
    .filter((i): i is ItemView => !!i && !!i.sortAt)
    .sort((a, b) => a.sortAt!.localeCompare(b.sortAt!));

  return (
    <>
      <section>
        <h2>Evidence</h2>
        {view.board.length === 0 && <p className="muted">Nothing yet. Open an item and post it to the Board.</p>}
        <ul className="list cork" aria-label="Board">
          {view.board.map((card, n) => {
            const item = items.get(card.item);
            return (
              <li key={card.item} className="pinned" style={{ ["--tilt" as string]: `${((n * 37) % 7) - 3}deg` }}>
                <button className="row-button" onClick={() => onOpen(card.item)}>
                  <span>{item?.title ?? card.item}</span>
                  {item?.time && <span className="muted small">{item.time}</span>}
                </button>
                <p className="muted small">
                  {playerName(card.postedBy)}
                  {card.note ? `: “${card.note}”` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {timeline.length > 1 && (
        <section>
          <h2>Timeline</h2>
          <ol className="timeline">
            {timeline.map((i) => (
              <li key={i.id}>
                <span className="tl-time">{i.time}</span>
                <span>{i.title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!view.verdict.open && view.board.length >= 3 && (
        <button className="wide" onClick={() => void act({ type: "callVerdict" })}>
          We're ready — call the verdict
        </button>
      )}

      <section>
        <h2>Notes</h2>
        <ul className="list">
          {view.notes.map((n) => (
            <li key={n.id}>
              <span className="muted small">{playerName(n.author)}:</span> {n.text}
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            void act({ type: "note", text: note }).then((r) => r.ok && setNote(""));
          }}
        >
          <input aria-label="New note" placeholder="A thought for the team" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </section>
    </>
  );
}

function Inbox({ view }: { view: PlayerView }) {
  return (
    <section>
      <h2>Inbox</h2>
      {view.inbox.length === 0 && <p className="muted">No messages.</p>}
      <ul className="list">
        {[...view.inbox].reverse().map((m) => (
          <li key={m.id} className="card telegram deal">
            <p className="eyebrow">{m.from}</p>
            <p>{m.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Remember which containers just unlocked or appeared, for one animation each.
function useContainerMoments(view: PlayerView) {
  const prev = useRef<Map<string, { locked: boolean; needsCouncil: boolean }> | null>(null);
  const [opening, setOpening] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const now = new Map(view.containers.map((c) => [c.id, { locked: c.locked, needsCouncil: c.needsCouncil }]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const justOpened = [...now].filter(([id, c]) => before.get(id)?.locked && !c.locked).map(([id]) => id);
    const justRevealed = [...now]
      .filter(([id, c]) => (!before.has(id) || before.get(id)!.needsCouncil) && !c.needsCouncil && view.containers.find((x) => x.id === id)?.kind === "location")
      .map(([id]) => id);
    if (justOpened.length) {
      setOpening(new Set(justOpened));
      setTimeout(() => setOpening(new Set()), 1100);
    }
    if (justRevealed.length) {
      play("unlock");
      setRevealed(new Set(justRevealed));
      setTimeout(() => setRevealed(new Set()), 1600);
    }
  }, [view.containers]);

  return { opening, revealed };
}

interface Toast {
  id: string;
  from: string;
  text: string;
}

// React to what the world does while the player is busy elsewhere:
// telegrams arrive, the Board fills, councils resolve, acts turn.
function useWorldReactions(view: PlayerView, playerName: (id: string) => string): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<{ inbox: number; board: number; act: string; approved: Set<string> } | null>(null);

  useEffect(() => {
    const approved = new Set(view.councils.filter((c) => c.status === "approved").map((c) => c.id));
    const before = prev.current;
    prev.current = { inbox: view.inbox.length, board: view.board.length, act: view.act.id, approved };
    if (!before) return;

    const fresh = view.inbox.slice(before.inbox);
    if (fresh.length) {
      play("bell");
      buzz([20, 60, 20]);
      setToasts((t) => [...t, ...fresh.map((m) => ({ id: m.id, from: m.from, text: m.text }))]);
      for (const m of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== m.id)), 5200);
    }
    const newCards = view.board.slice(before.board).filter((c) => c.postedBy !== view.me.id);
    if (newCards.length) {
      play("pin");
      const c = newCards[newCards.length - 1]!;
      const id = `b${c.item}`;
      setToasts((t) => [...t, { id, from: "The Board", text: `${playerName(c.postedBy)} pinned new evidence.` }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    }
    if ([...approved].some((id) => !before.approved.has(id))) {
      play("seal");
      buzz([10, 30, 60]);
      flash("wax");
    }
    if (view.act.id !== before.act) {
      play("reveal");
      flash("gold");
    }
  }, [view.inbox, view.board, view.act.id, view.councils, view.me.id, playerName]);

  return toasts;
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-seal" aria-hidden="true">
            {"✉\uFE0E"}
          </span>
          <span>
            <span className="eyebrow">{t.from}</span>
            <br />
            {t.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function SoundToggle() {
  const [off, setOff] = useState(isMuted());
  return (
    <button
      className="sound-toggle"
      aria-label={off ? "Sound off" : "Sound on"}
      onClick={() => {
        setMuted(!off);
        setOff(!off);
      }}
    >
      {off ? "🔇\uFE0E" : "🔊\uFE0E"}
    </button>
  );
}


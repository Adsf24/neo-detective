import type { ApplyResult, ItemView, PlayerView } from "@neo/engine";
import { useMemo, useState } from "react";
import type { AskResult, ClientAction } from "../../server/src/protocol";
import { CallScreen } from "./CallScreen";
import { ActTransition, CouncilBanner } from "./Collective";
import { Debrief, Verdict } from "./Finale";
import { ItemDetail } from "./ItemDetail";

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

  if (!briefed) {
    return (
      <main className="screen">
        <p className="eyebrow">Briefing</p>
        <h1>{view.briefing.title}</h1>
        {view.briefing.text.split("\n\n").map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="card">
          <p className="eyebrow">Only you — {view.me.slotLabel}</p>
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
    </>
  );

  function renderMain() {
    return (
    <div className="app">
      <header className="topbar">
        <span>{view.title}</span>
        <span className="muted">{view.act.title}</span>
      </header>
      {error && (
        <p className="error" role="alert" onClick={clearError}>
          {error}
        </p>
      )}
      <main className="content">
        {tab === "world" && <World view={view} items={items} act={act} onOpen={setOpen} onCall={setCalling} />}
        {tab === "board" && <Board view={view} items={items} act={act} onOpen={setOpen} playerName={playerName} />}
        {tab === "inbox" && <Inbox view={view} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        <button aria-pressed={tab === "world"} onClick={() => setTab("world")}>
          World
        </button>
        <button aria-pressed={tab === "board"} onClick={() => setTab("board")}>
          Board <span className="badge">{view.board.length}</span>
        </button>
        <button aria-pressed={tab === "inbox"} onClick={() => setTab("inbox")}>
          Inbox {view.inbox.length > 0 && <span className="badge">{view.inbox.length}</span>}
        </button>
      </nav>
    </div>
    );
  }
}

function ItemRow({ item, onOpen }: { item: ItemView; onOpen: (id: string) => void }) {
  return (
    <li>
      <button className="row-button" onClick={() => onOpen(item.id)}>
        <span>{item.title}</span>
        {item.time && <span className="muted small">{item.time}</span>}
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
          {folder.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} />
          ))}
        </ul>
      </section>

      {top.map((c) => (
        <section key={c.id}>
          <h2>{c.title}</h2>
          {c.needsCouncil ? (
            <button className="wide" onClick={() => void act({ type: "councilRequest", payload: { kind: "search", container: c.id } })}>
              Search — needs a second detective
            </button>
          ) : c.locked ? (
            <Unlock container={c.id} act={act} />
          ) : (
            <>
              <ul className="list">
                {inContainer(c.id).map((i) => (
                  <ItemRow key={i.id} item={i} onOpen={onOpen} />
                ))}
              </ul>
              {children(c.id).map((child) => (
                <details key={child.id} className="sub">
                  <summary>{child.title}</summary>
                  <ul className="list">
                    {inContainer(child.id).map((i) => (
                      <ItemRow key={i.id} item={i} onOpen={onOpen} />
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
              <span>
                {c.name} <span className="muted small">· {c.role}</span>
              </span>
              <button onClick={() => onCall(c.id)}>{c.channel === "voice" ? "Call" : "Message"}</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Unlock({ container, act }: { container: string; act: Act }) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        void act({ type: "unlock", container, password });
      }}
    >
      <input aria-label="Password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Unlock</button>
    </form>
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
        <ul className="list" aria-label="Board">
          {view.board.map((card) => {
            const item = items.get(card.item);
            return (
              <li key={card.item} className="card">
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
                <span className="muted small">{i.time}</span> {i.title}
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
          <li key={m.id} className="card">
            <p className="eyebrow">{m.from}</p>
            <p>{m.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

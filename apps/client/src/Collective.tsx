import type { ApplyResult, ItemView, PlayerView } from "@neo/engine";
import { useState } from "react";
import type { ClientAction } from "../../server/src/protocol";

type Act = (action: ClientAction) => Promise<ApplyResult>;

// The Council: an irreversible move waits for a second detective.
export function CouncilBanner({ view, act, playerName }: { view: PlayerView; act: Act; playerName: (id: string) => string }) {
  const open = view.councils.filter((c) => c.status === "open");
  if (open.length === 0) return null;
  return (
    <div className="council" role="alert">
      {open.map((c) =>
        c.requestedBy === view.me.id ? (
          <div key={c.id}>
            <p className="eyebrow">Waiting for a second detective</p>
            <p>{c.summary}</p>
            <button onClick={() => void act({ type: "councilCancel", council: c.id })}>Cancel</button>
          </div>
        ) : (
          <div key={c.id}>
            <p className="eyebrow">{playerName(c.requestedBy)} needs your agreement</p>
            <p>
              <strong>{c.summary}</strong>
            </p>
            <p className="small muted">{c.risk}</p>
            <div className="row">
              <button className="primary" onClick={() => void act({ type: "councilDecide", council: c.id, approve: true })}>
                Agree
              </button>
              <button onClick={() => void act({ type: "councilDecide", council: c.id, approve: false })}>Not yet</button>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

// Act transition: the team must put a working version on record before the
// story moves on. Materials stay viewable while they argue.
export function ActTransition({ view, items, act }: { view: PlayerView; items: Map<string, ItemView>; act: Act }) {
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  if (!view.transition) return null;

  if (minimized) {
    return (
      <button className="council wide-bar" onClick={() => setMinimized(false)}>
        Before “{view.transition.title}”: record the team's version →
      </button>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-label="Working version">
      <main className="screen">
        <button className="link-button" onClick={() => setMinimized(true)}>
          Look through the materials first
        </button>
        <p className="eyebrow">Before “{view.transition.title}”</p>
        <h1>What does the team think so far?</h1>
        <p className="muted">
          Talk it through and record one version together. It can be wrong — it's where you stand right now. The story won't move on
          until it's recorded.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: "version", who, what, why, items: chosen }).then((r) => setError(r.ok ? null : r.error));
          }}
        >
          <label className="field">
            Who
            <select aria-label="Who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose a person…</option>
              {view.suspects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.role}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            What happened
            <textarea aria-label="What happened" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} />
          </label>
          <label className="field">
            Why
            <textarea aria-label="Why" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <fieldset className="field">
            <legend>Evidence from the Board</legend>
            {view.board.length === 0 && <p className="muted small">Nothing on the Board yet — post something first.</p>}
            {view.board.map((card) => (
              <label key={card.item} className="check">
                <input
                  type="checkbox"
                  checked={chosen.includes(card.item)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, card.item] : c.filter((x) => x !== card.item)))}
                />
                {items.get(card.item)?.title ?? card.item}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="primary wide">
            Record our version
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    </div>
  );
}

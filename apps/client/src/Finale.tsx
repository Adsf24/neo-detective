import type { ApplyResult, ItemView, PlayerView } from "@neo/engine";
import { useEffect, useState } from "react";
import { Backdrop } from "./Cinematic";
import { burst, play } from "./fx";
import type { ClientAction } from "../../server/src/protocol";

type Act = (action: ClientAction) => Promise<ApplyResult>;

// Preliminary verdict → accusation. Votes are secret until everyone has voted.
export function Verdict({ view, items, act, playerName }: { view: PlayerView; items: Map<string, ItemView>; act: Act; playerName: (id: string) => string }) {
  const [error, setError] = useState<string | null>(null);
  const v = view.verdict;
  if (!v.open) return null;
  const suspect = (id: string) => view.suspects.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="overlay curtain" role="dialog" aria-label="Verdict">
      {view.cover && <div className="overlay-shot" style={{ backgroundImage: `url(/${view.cover})` }} aria-hidden="true" />}
      <div className="letterbox on" aria-hidden="true" />
      <main className="screen">
        <p className="eyebrow">The verdict</p>
        {!v.revealed ? (
          <>
            <h1 className="display">Who did it? Vote on your own.</h1>
            <p className="muted">Nobody sees your vote until everyone has voted.</p>
            <ul className="list suspects">
              {view.suspects.map((s, n) => (
                <li key={s.id} className="deal" style={{ animationDelay: `${n * 90}ms` }}>
                  <button
                    className={`row-button suspect-card${v.mine === s.id ? " chosen" : ""}`}
                    onClick={() => void act({ type: "vote", who: s.id }).then((r) => setError(r.ok ? null : r.error))}
                  >
                    <span className="medallion" aria-hidden="true">
                      {s.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="contact-name">
                      {s.name}
                      <span className="muted small">{s.role}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Voted: {v.voted.length} of {view.players.length}
              {v.mine && ` · you chose ${suspect(v.mine)}`}
            </p>
          </>
        ) : (
          <>
            <h1 className="display">The votes</h1>
            <ul className="list votes">
              {Object.entries(v.revealed).map(([player, who], n) => (
                <li key={player} className="flip" style={{ animationDelay: `${n * 220}ms` }}>
                  <span className="muted small">{playerName(player)}</span>
                  <strong>{suspect(who)}</strong>
                </li>
              ))}
            </ul>
            {new Set(Object.values(v.revealed)).size > 1 && (
              <p className="notice">You don't agree. Talk it through before you accuse — you only get one.</p>
            )}
            <AccusationForm view={view} items={items} act={act} onError={setError} />
          </>
        )}
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}

function AccusationForm({ view, items, act, onError }: { view: PlayerView; items: Map<string, ItemView>; act: Act; onError: (e: string | null) => void }) {
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act({ type: "accuse", who, what, why, items: chosen }).then((r) => onError(r.ok ? null : r.error));
      }}
    >
      <h2>The accusation</h2>
      <label className="field">
        Who
        <select aria-label="Accused" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Choose a person…</option>
          {view.suspects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        What happened
        <textarea aria-label="What happened, in order" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} />
      </label>
      <label className="field">
        Why
        <textarea aria-label="Motive" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Evidence from the Board (at least three)</legend>
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
        Accuse
      </button>
    </form>
  );
}

export function Debrief({ view, items, playerName }: { view: PlayerView; items: Map<string, ItemView>; playerName: (id: string) => string }) {
  const d = view.debrief!;
  useEffect(() => {
    const t1 = setTimeout(() => play("stamp"), 380);
    if (d.score.outcome !== "solved") return () => clearTimeout(t1);
    const timers = [0, 450, 900].map((ms, i) =>
      setTimeout(() => {
        burst(window.innerWidth * (0.25 + i * 0.25), window.innerHeight * 0.22, "gold", 26);
        if (i === 0) play("reveal");
      }, 500 + ms),
    );
    return () => [t1, ...timers].forEach(clearTimeout);
  }, [d.score.outcome]);
  const headline =
    d.score.outcome === "solved" ? "Case closed." : d.score.outcome === "right_unproven" ? "Right name. Thin case." : "Wrong person.";
  const accused = view.suspects.find((s) => s.id === d.accusation.who)?.name ?? d.accusation.who;
  return (
    <main className="screen debrief">
      <Backdrop src={d.reconstruction.image} dim={0.72} />
      <p className="eyebrow">Debrief</p>
      <h1 className={`verdict-stamp outcome-${d.score.outcome}`}>{headline}</h1>
      <p>
        {playerName(d.accusation.by)} accused <strong>{accused}</strong>.{" "}
        {d.score.culprit ? "That's who did it." : `It was ${d.culpritName}.`}
      </p>
      <ul className="list scores">
        <li>Culprit: {d.score.culprit ? "✓" : "✗"}</li>
        <li>Proof: {d.score.proof === "full" ? "✓ a complete chain" : d.score.proof === "partial" ? "◐ partial" : "✗ none"}</li>
        <li>Motive: {d.score.motive ? "✓" : "✗"}</li>
      </ul>
      {d.score.claims.some((c) => c.proven) && (
        <>
          <h2>What your evidence proved</h2>
          <ul className="list">
            {d.score.claims.filter((c) => c.proven).map((c) => (
              <li key={c.id}>✓ {c.statement}</li>
            ))}
          </ul>
        </>
      )}

      <h2>What really happened — {d.reconstruction.narrator}</h2>
      {d.reconstruction.portrait && (
        <div className="confession-portrait" style={{ backgroundImage: `url(/${d.reconstruction.portrait})` }} aria-hidden="true" />
      )}
      {d.reconstruction.text.split("\n\n").map((p, i) => (
        <p key={i} className="quote">
          {p}
        </p>
      ))}
      {d.reconstruction.reveals.map((r, i) => (
        <p key={i} className="finding">
          {r}
        </p>
      ))}

      <h2>Your investigation</h2>
      <ul className="list">
        {d.history.highlights.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
      {d.history.missed.length > 0 && (
        <>
          <h2>Evidence you never put on the Board</h2>
          <ul className="list">
            {d.history.missed.map((m) => (
              <li key={m} className="muted">
                {m}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">Accusation backed by: {d.accusation.items.map((i) => items.get(i)?.title ?? i).join(", ")}</p>
      <a className="primary wide button-link" href="/">
        Play another case
      </a>
    </main>
  );
}

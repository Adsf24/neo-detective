import type { CasePack, DirectorAction } from "@neo/case-schema";
import { evaluate } from "./conditions";
import { deliverMessage, type GameState, slotsOf, trashItem, worldContext } from "./game";

// The director runs the case's prepared events. It reacts to world state —
// flags, the Board, time — and never to the team's hypotheses: a recorded
// version is read for hints only by the case author's conditions, and the
// truth never bends toward it.

export function recipients(pack: CasePack, state: GameState, to: "all" | string): string[] {
  if (to === "all") return state.players.map((p) => p.id);
  return state.players.filter((p) => slotsOf(pack, state, p.id).includes(to)).map((p) => p.id);
}

function run(pack: CasePack, state: GameState, action: DirectorAction, now: number) {
  switch (action.type) {
    case "message":
      deliverMessage(state, recipients(pack, state, action.to), action.from, action.text, now);
      return;
    case "trashItem":
      trashItem(state, action.item, action.trashRecord);
      return;
    case "revealItem":
      state.revealed.add(action.item);
      return;
    case "setFlag":
      state.flags.add(action.flag);
      return;
    case "actTransition":
      if (state.act !== action.toAct && !state.transition) state.transition = { toAct: action.toAct, since: now };
      return;
    case "requestVerdict":
      state.verdictRequested = true;
      return;
  }
}

// Advance the director. Returns the ids of events that fired, so the caller
// knows whether to broadcast. Paused while the team records a version.
export function tick(pack: CasePack, state: GameState, now: number): string[] {
  if (state.phase !== "playing" || state.transition) return [];
  const fired: string[] = [];

  const fire = (id: string) => {
    const event = pack.events.find((e) => e.id === id)!;
    if (event.once) state.fired.add(id);
    for (const action of event.actions) run(pack, state, action, now);
    state.log.push({ at: now, type: "event", detail: { event: id } });
    fired.push(id);
  };

  // Repeat while events keep changing the world, firing each event at most
  // once per tick; stop as soon as an act transition pauses the director.
  for (let changed = true; changed && !state.transition; ) {
    changed = false;
    const ctx = worldContext(state, now);
    const due = state.pending.filter((p) => p.dueAt <= now);
    state.pending = state.pending.filter((p) => p.dueAt > now);
    const ready = [
      ...due.map((p) => p.event),
      ...pack.events
        .filter((e) => !state.fired.has(e.id) && !fired.includes(e.id) && !state.pending.some((p) => p.event === e.id))
        .filter((e) => !due.some((p) => p.event === e.id) && evaluate(e.when, ctx))
        .flatMap((e) => {
          if (e.delayMinutes <= 0) return [e.id];
          state.pending.push({ event: e.id, dueAt: now + e.delayMinutes * 60_000 });
          return [];
        }),
    ];
    for (const id of ready) {
      if (state.transition) {
        state.pending.push({ event: id, dueAt: now }); // resume after the version is recorded
        continue;
      }
      fire(id);
      changed = true;
    }
  }

  return fired;
}

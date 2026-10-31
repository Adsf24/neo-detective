# NEO Detective — working notes for Claude

Cooperative digital detective board game for 3–5 players, each on their own phone. Players investigate a pre-written case in a small digital world (mailboxes, a computer, photos) and call AI witnesses who answer by voice. Built for a 3-day Meta hackathon; characters run on Llama.

Design source of truth: `docs/gdd.md` (RU). Hackathon scope and day plan: `docs/hackathon-plan.md` (RU). Tasks: Linear team NEO, project "NEO DETECTIVE — Hackathon MVP" — every task has a "Done when" line.

## The one rule

**The truth lives in the engine, not in the prompt.**

A character never sees facts it is not allowed to say yet. Before every reply the engine computes the character's unlocked facts from world state (evidence presented in this call, who is asking, prior admissions, question class). The LLM receives only the character's bio, cover story and those unlocked facts, and returns `{reply, mentioned_fact_ids}`. The engine rejects any reply that mentions a fact outside the unlocked set.

Consequences:
- Confession conditions are code with unit tests, not prompt instructions.
- The LLM never decides what is true, never invents evidence, never changes the timeline.
- The team's working hypothesis is input for choosing hints, never truth: the world does not adapt to a guess.
- No evidence (images, documents, facts) is generated at runtime. Everything evidentiary comes from the case pack.

## Layout

| Path | What |
|---|---|
| `packages/case-schema` | Zod schema for a case pack. The contract between content and code |
| `packages/engine` | Pure game logic: presence, world state, contracts, director, scoring. No I/O, no LLM calls |
| `apps/server` | Fastify + Socket.IO. Thin transport: rooms, state broadcast, LLM provider calls |
| `apps/client` | Vite + React, mobile-first. Renders whatever the case pack and server state say |
| `cases/<case-id>` | Case content only (JSON + media). Validated against the schema by a test |
| `e2e` | Playwright tests with several browser clients in one room |
| `docs` | Design docs |

Boundaries:
- Code never mentions case-specific names (Marina, the gallery, item numbers). If you need one, it belongs in `cases/`.
- `packages/engine` must stay pure and synchronous where possible; the server wires it to sockets and LLMs.
- The socket contract lives in `apps/server/src/protocol.ts` and is imported by the client.
- The LLM sits behind `LlmProvider` in `apps/server/src/llm`. `LlamaProvider` talks to the Meta Model API (`https://api.meta.ai/v1`, Muse models, minimal reasoning effort) when `LLAMA_API_KEY` is set; otherwise `ScriptedProvider`, a deterministic offline stand-in. e2e always runs scripted. Do not call a model from anywhere else.
- The reply loop lives in `apps/server/src/dialogue.ts`: classify → `planTurn` (contract engine) → role-play prompt with unlocked knowledge only → `checkReply` → one retry → safe line. To save latency the reply is drafted in parallel from a keyword classification on a cloned state and reused when the model's classification unlocks the same knowledge.
- `npx tsx scripts/live-dialogue.ts` plays scripted interrogations (incl. jailbreaks) against the real model and reports latency and leaks. Run it after any change to prompts, contracts or the reply loop.

## Commands

```bash
npm install
npm run dev          # server :3000 + Vite client :5173 (proxies /socket.io)
npm run typecheck
npm run lint
npm test             # Vitest unit tests
npm run e2e          # builds the client, starts the server on :3100, runs Playwright
```

Secrets go in `.env` (see `.env.example`). Never commit `.env`, never print a key in logs or output.

## Definition of done

A task is done only when:
1. Its "Done when" criterion from the Linear issue is met by a test that runs in `npm test` or `npm run e2e`.
2. `npm run typecheck`, `npm run lint` and `npm test` are green.
3. The change is committed on the task's branch with a message that names the issue (e.g. `NEO-13: rooms and join by link`).

Do not mark work done on the strength of "it should work". If a criterion cannot be tested automatically (voice latency on a real phone, image legibility), say so explicitly in the PR and leave the issue for Vic to verify.

## Working conventions

- One Linear issue per branch: `neo-<n>/<short-slug>`.
- Two parallel streams per day run in separate git worktrees; each stream owns its files. Stream A — server and engine; stream B — client and objects (see the issue description).
- Engine first, then wiring, then UI: unit-test the logic before touching sockets or React.
- Keep the client mobile-first: 375 px wide, no horizontal scroll, large tap targets.
- Prefer small, boring code. This is a 3-day build; no abstractions for cases we do not have.
- When the GDD and an issue disagree, the issue wins for the hackathon; note the conflict in the PR.

## Never

- Generate evidentiary content at runtime.
- Give the LLM the full truth of the case.
- Add accounts, payments or persistence — out of scope for the MVP.
- Commit secrets, or send player data anywhere except the LLM provider for the current turn.

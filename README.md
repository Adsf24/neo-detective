# NEO Detective

**A cooperative detective board game for 3–4 players, played on their own phones — where the evidence isn't handed to you, you dig it out, and the witnesses talk back.**

Classic detective boxes give you twenty printed clues. NEO Detective gives you the case itself: a gallery computer to unlock, two mailboxes to read, photos to zoom into, a door log, a browser history — and three people you can call. Ask them anything. Show them what you found. Catch them lying.

The first case, *The Missing Original*, takes 25–35 minutes.

## How a game goes

1. One player creates a room; the others scan the QR code.
2. Everyone reads the briefing — and their own private starting material. Only one player has the computer password. Only one has the photos. Only one is trusted by the technician.
3. Players explore in parallel and post findings to a shared **Board**, with a line on why each matters.
4. They **call witnesses** on speakerphone and show them evidence. Showing evidence to a suspect is irreversible, so a **second player must agree** first.
5. The world reacts. A rattled suspect deletes an email. A witness reaches out to one player privately. When the story turns, the game stops and the team must **write down a working version** before it moves on.
6. Everyone votes in secret, then the team **accuses** — and must back the accusation with evidence from the Board.
7. The **debrief** tells what really happened, scores the accusation against the case's evidence graph (a right name without proof is a guess), and tells the team's own story: who caught the first lie, which question broke the case, what they never looked at.

## The idea that makes it work

**The truth lives in the engine, not in the prompt.**

A character never knows more than it is willing to say right now. Before every reply the engine evaluates the character's contract — *which evidence has been shown, who is asking, what has already been admitted, what the question is about* — and passes the language model only the cover story and the knowledge that is unlocked at that moment. A model cannot leak what it never sees.

```
question ──► fast Muse model: which topics, is it an accusation?
         ──► contract engine (deterministic): what may this character say now?
         ──► strong Muse model: role-play using only that
         ──► check: the reply may rely only on unlocked knowledge ──► retry / safe line
```

So a suspect can't be talked into confessing by pressure alone — only by the right evidence and the right question. Every row of the suspect's confession table is a unit test.

## Built with

- **Meta Muse models** (`muse-spark` via the Meta Model API) for question classification and character role-play.
- TypeScript throughout: React + Vite client, Fastify + Socket.IO server, a pure game engine, and a Zod schema for case packs.
- Browser speech recognition and synthesis for voice calls (Chrome).

A case is data, not code: `cases/missing-original` holds the truth, timeline, characters and their contracts, items, director events, the evidence graph and the reconstruction. A validator checks every reference and every flag before a case can load.

## Run it

```bash
npm install
cp .env.example .env      # add LLAMA_API_KEY (Meta Model API key); without it an offline scripted provider is used
npm run dev               # server :3000, client :5173
```

Open `http://localhost:5173`, create a room, join from other devices on the same network. Add `&demo` to the room link to start a few minutes in, right before confronting the suspect.

```bash
npm test                  # unit tests: engine, contracts, director, scoring, case validation
npm run e2e               # Playwright: several players in one room, end to end
docker build -t neo-detective . && docker run -p 8080:8080 --env-file .env neo-detective
```

## Layout

| Path | What |
|---|---|
| `packages/engine` | Game state, visibility, contracts, director, Council, scoring, team history, prompts |
| `packages/case-schema` | Case pack schema and validator |
| `cases/missing-original` | The first case and its illustrated photos |
| `apps/server` | Rooms, sockets, reply loop, LLM providers |
| `apps/client` | Mobile-first React client |
| `docs` | Game design document and plans (Russian) |

Working rules for contributors and coding agents: `CLAUDE.md`.

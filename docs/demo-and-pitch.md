# NEO Detective — demo script and pitch

Draft for the Meta hackathon submission. Adjust timings to the official format once the rules are known (NEO-11).

---

## One line

**A cooperative detective board game played on your phones, where the evidence isn't handed to you — you dig it out — and the witnesses talk back.**

## The 60-second pitch

Boxed detective games give you twenty printed clues. We give you the case itself.

Three or four friends open a link on their phones. One holds the gallery computer's password, another the photos, another is the only person the technician will talk to. To solve the case they have to talk to each other.

They dig through mailboxes, a registry change log, a door access log. They zoom into a photo and find an envelope that shouldn't be there. Then they call the gallery administrator — by voice — and she lies to them. Show her the change log and she blames the owner. Show her the email *and* ask her straight, and she breaks.

What makes it work: **the truth lives in the engine, not in the prompt.** Before every reply our engine decides what the character is allowed to say right now, based on the evidence on the table and the question asked. The model only ever sees the cover story and the unlocked facts — it cannot leak what it never sees. In live tests: zero leaks, including jailbreak attempts, with a median answer in 1.5 seconds.

And it is built end to end on Meta's models: **Muse Spark** plays the witnesses, **Muse Image** shot every scene, portrait and piece of photographic evidence, and **Muse Voice Transcribe** hears players on phones that can't recognise speech themselves.

A case is data, not code. The next case is a writer's job, not an engineer's.

## Three-minute live demo

Setup before going on stage: laptop on a projector with the desktop room; two phones on the table. Room link prepared with `&demo` (starts at minute 8, key evidence already on the Board). Sound on. Backup: the same flow in text if the venue mic fails.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Title shot, the empty frame in the spotlight | "Last night a photograph worth $180,000 was swapped for a copy. You have three detectives, their phones and twenty minutes." |
| 0:15 | Phones join by QR; briefing letter in the rain | "Everyone gets the same briefing — and something only they know." |
| 0:35 | Desktop room: scenes left, Board right | "No cards. A computer to unlock, mailboxes, logs, photos. Everything you pin to the Board is what you can accuse with." |
| 0:55 | Open the packing-table photo, zoom, tap the envelope | "The detail is in the photo — you have to find it." Sparks. |
| 1:15 | Call Marina on speakerphone. Ask: "What did you do on Wednesday afternoon?" | Close-up, subtitle answer. "She has a cover story." |
| 1:35 | Show the change log. The Council asks a second phone to agree | "Showing evidence to a suspect can't be undone — a second detective has to agree." |
| 1:50 | Marina lies: "Paul asked me to mark it for restoration." | "Now she's lying — and the game knows she is." |
| 2:05 | Show the email "Done. When?" and ask "Did you take the original?" | Camera pushes in. Confession. "Only the right evidence and the right question break her." |
| 2:30 | Verdict: secret votes flip, accusation with Board evidence | "You can't win by guessing a name — the accusation is scored against the evidence." |
| 2:45 | Debrief: "Case closed.", the reconstruction in her voice, the team's story | "Every evening tells a different story." |

## What judges might ask

- **Can players jailbreak the witness?** The model never receives locked facts. A checker rejects any reply that relies on knowledge outside the unlocked set; one retry, then a safe line. `scripts/live-dialogue.ts` runs jailbreak scripts against the real model.
- **Why not let the model write the mystery?** Generated mysteries don't hold together under interrogation. A case is authored: the truth, the timeline, who knows what, and what makes each person talk. The model brings people to life; it doesn't decide what happened.
- **Is it fair?** Every required claim has at least two independent sources; a validator checks every reference in a case before it loads; scoring follows the case's evidence graph.
- **What does it cost to run?** Two short model calls per question (classification, role-play); per-room and global limits guard the credits.
- **What's next?** A case editor, a catalogue of cases (thefts, disappearances, family secrets), harder difficulty levels, real-world channels (an email from a witness in your actual inbox) as an opt-in mode.

## Video (2–3 minutes)

Record the live demo flow above on real phones with three people at a table, plus screen capture of the desktop room. Keep the confession moment uncut.

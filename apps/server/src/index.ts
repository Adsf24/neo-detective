import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { missingOriginal } from "@neo/case-missing-original";
import { validateCasePack } from "@neo/case-schema";
import Fastify from "fastify";
import { Server } from "socket.io";
import { Readable } from "node:stream";
import { createProvider } from "./llm";
import { createTts, performance } from "./tts";
import type { ClientToServer, ServerToClient } from "./protocol";
import { Rooms } from "./rooms";

// .env holds the Meta key; .env.local is where the ElevenLabs CLI wrote its key.
for (const name of [".env", ".env.local"]) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", name);
  if (existsSync(file)) process.loadEnvFile(file);
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");
const caseMedia = path.resolve(here, "../../../cases/missing-original/media");

const validated = validateCasePack(missingOriginal);
if (!validated.ok) throw new Error(`Invalid case pack:\n${validated.errors.join("\n")}`);
const llm = createProvider();
const tts = createTts();
const rooms = new Rooms(validated.pack, llm);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
app.get("/health", async () => ({ ok: true }));

// A witness line, voiced. Only lines that were said in this room, only to a
// player who heard them; cached so a refresh doesn't pay twice.
const voiceCache = new Map<string, Buffer>();
let synthesizing = 0;
app.get("/api/voice", async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  if (!tts) return reply.code(501).send({ error: "No voice actor configured." });
  const args = [String(q.room ?? "").toLowerCase(), String(q.player ?? ""), String(q.character ?? ""), Number(q.n)] as const;
  const found = rooms.voiceLine(...args, false);
  if (!found.ok) return reply.code(found.status).send({ error: found.error });

  reply.header("content-type", "audio/mpeg").header("cache-control", "private, max-age=3600");
  const cached = voiceCache.get(found.key);
  if (cached) return reply.send(cached);
  if (synthesizing >= 3) return reply.code(429).send({ error: "Voice lines are busy." });
  const charged = rooms.voiceLine(...args, true);
  if (!charged.ok) return reply.code(charged.status).send({ error: charged.error });

  synthesizing += 1;
  try {
    const body = Readable.fromWeb((await tts.synthesize(performance(found.reply, found.delivery), found.voice)) as never);
    const chunks: Buffer[] = [];
    body.on("data", (c: Buffer) => chunks.push(c));
    body.on("end", () => {
      voiceCache.set(found.key, Buffer.concat(chunks));
      if (voiceCache.size > 300) voiceCache.delete(voiceCache.keys().next().value!);
    });
    body.on("close", () => (synthesizing -= 1));
    return reply.send(body);
  } catch (err) {
    synthesizing -= 1;
    req.log.error(err);
    return reply.code(502).send({ error: "The voice dropped out." });
  }
});

// Voice questions from browsers without built-in speech recognition. WAV in,
// text out; the text goes back into the question box for the player to check.
app.addContentTypeParser("audio/wav", { parseAs: "buffer", bodyLimit: 2_000_000 }, (_req, body, done) => done(null, body));
let transcribing = 0;
app.post("/api/transcribe", async (req, reply) => {
  if (!llm.transcribe) return reply.code(501).send({ error: "Voice input needs the Meta Model API key." });
  if (transcribing >= 6) return reply.code(429).send({ error: "Too many voices at once. Try again." });
  const wav = req.body as Buffer;
  if (!Buffer.isBuffer(wav) || wav.length < 1000) return reply.code(400).send({ error: "No audio." });
  transcribing += 1;
  try {
    return { text: await llm.transcribe(wav) };
  } catch (err) {
    req.log.error(err);
    return reply.code(502).send({ error: "Couldn't hear that. Try again or type." });
  } finally {
    transcribing -= 1;
  }
});

await app.register(fastifyStatic, { root: caseMedia, prefix: "/media/", decorateReply: false });
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
}

const io = new Server<ClientToServer, ServerToClient>(app.server, { cors: { origin: true } });

function broadcast(code: string) {
  for (const [player, view] of rooms.views(code)) io.to(`${code}:${player}`).emit("view", view);
}

io.on("connection", (socket) => {
  let room: string | undefined;
  let player: string | undefined;

  socket.on("join", async ({ room: code, name, player: id }, ack) => {
    const cleanName = String(name ?? "").trim().slice(0, 24);
    const cleanCode = String(code ?? "").trim().toLowerCase().slice(0, 32);
    if (!cleanName || !cleanCode || !id) return ack({ ok: false, error: "Name and room are required." });
    const res = await rooms.act(cleanCode, { type: "join", player: id, name: cleanName });
    if (!res.ok) return ack(res);
    room = cleanCode;
    player = id;
    void socket.join(`${room}:${player}`);
    ack({ ok: true, player: id });
    broadcast(room);
  });

  socket.on("ask", async ({ character, question, presented, shared }, ack) => {
    if (!room || !player) return ack({ ok: false, error: "Join a room first." });
    const code = room;
    try {
      const res = await rooms.ask(code, player, {
        character: String(character ?? ""),
        question: String(question ?? ""),
        presented: Array.isArray(presented) ? presented.map(String) : [],
        shared: shared === true,
      });
      ack(res);
      if (res.ok) broadcast(code);
    } catch (err) {
      app.log.error(err);
      ack({ ok: false, error: "The line crackled and went dead. Try again." });
    }
  });

  socket.on("act", async (action, ack) => {
    if (!room || !player) return ack({ ok: false, error: "Join a room first." });
    const code = room;
    try {
      const res = await rooms.act(code, { ...action, player } as never);
      ack(res);
      if (res.ok) broadcast(code);
    } catch (err) {
      app.log.error(err);
      ack({ ok: false, error: "Something went wrong. Try again." });
    }
  });
});

// The director also acts on time alone (hints, deadlines, delayed reactions).
setInterval(() => {
  for (const code of rooms.codes()) if (rooms.tick(code).length) broadcast(code);
}, 5_000).unref();

app.log.info(`LLM provider: ${llm.name}; voice: ${tts?.name ?? "browser"}`);
await app.listen({ port: PORT, host: HOST });

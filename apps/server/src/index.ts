import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { missingOriginal } from "@neo/case-missing-original";
import { validateCasePack } from "@neo/case-schema";
import Fastify from "fastify";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "./protocol";
import { Rooms } from "./rooms";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");
const caseMedia = path.resolve(here, "../../../cases/missing-original/media");

const validated = validateCasePack(missingOriginal);
if (!validated.ok) throw new Error(`Invalid case pack:\n${validated.errors.join("\n")}`);
const rooms = new Rooms(validated.pack);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
app.get("/health", async () => ({ ok: true }));

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

  socket.on("join", ({ room: code, name, player: id }, ack) => {
    const cleanName = String(name ?? "").trim().slice(0, 24);
    const cleanCode = String(code ?? "").trim().toLowerCase().slice(0, 32);
    if (!cleanName || !cleanCode || !id) return ack({ ok: false, error: "Name and room are required." });
    const res = rooms.act(cleanCode, { type: "join", player: id, name: cleanName });
    if (!res.ok) return ack(res);
    room = cleanCode;
    player = id;
    void socket.join(`${room}:${player}`);
    ack({ ok: true, player: id });
    broadcast(room);
  });

  socket.on("act", (action, ack) => {
    if (!room || !player) return ack({ ok: false, error: "Join a room first." });
    const res = rooms.act(room, { ...action, player } as never);
    ack(res);
    if (res.ok) broadcast(room);
  });
});

await app.listen({ port: PORT, host: HOST });

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { Presence } from "@neo/engine";
import Fastify from "fastify";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "./protocol";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
app.get("/health", async () => ({ ok: true }));

if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
}

const io = new Server<ClientToServer, ServerToClient>(app.server, { cors: { origin: true } });
const presence = new Presence();

io.on("connection", (socket) => {
  let current: string | undefined;

  socket.on("join", ({ room, name }) => {
    if (current) io.to(current).emit("presence", presence.leave(current, socket.id));
    current = room;
    void socket.join(room);
    io.to(room).emit("presence", presence.join(room, { id: socket.id, name }));
  });

  socket.on("disconnect", () => {
    if (current) io.to(current).emit("presence", presence.leave(current, socket.id));
  });
});

await app.listen({ port: PORT, host: HOST });

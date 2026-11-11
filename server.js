import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, paths } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import {
  perpBacktest,
  perpHistory,
  perpStatus,
  rebalancePerp,
  resetPerpPaper,
} from "./lib/perp/paper.js";

loadEnv();

const PORT = Number(process.env.PORT || 3001);
const app = Fastify({ logger: false });

await app.register(fastifyCors, { origin: true });

app.get("/api/health", async () => ({ ok: true, uptime: process.uptime() }));

app.get("/api/perp/status", async () => perpStatus());

app.get("/api/perp/history", async (req) => {
  const { limit = "100" } = req.query || {};
  return perpHistory(Number(limit) || 100);
});

app.post("/api/perp/rebalance", async (req, reply) => {
  try {
    return rebalancePerp();
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/perp/reset", async () => resetPerpPaper());

app.get("/api/perp/backtest", async (req, reply) => {
  try {
    return perpBacktest(String(req.query?.dataset || "current"));
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

const dist = join(paths.root, "client", "dist");
const hasBuild = existsSync(join(dist, "index.html"));

if (hasBuild) {
  await app.register(fastifyStatic, { root: dist, prefix: "/" });

  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.sendFile("index.html");
  });
}

await app.listen({ port: PORT, host: "0.0.0.0" });

logger.info(
  "system",
  "server_start",
  `Perp momentum engine started on port ${PORT}`,
  { port: PORT }
);

const stop = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

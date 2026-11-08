import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, paths } from "./lib/env.js";
import {
  countNews,
  deleteAgent,
  getAgent,
  getBacktest,
  getDataset,
  insertAgent,
  listAgents,
  listBacktests,
  listDatasets,
  listLogs,
  listRugChecks,
  listSignals,
  resetPaperTrading,
  saveBacktest,
  saveSignals,
} from "./db.js";
import {
  getHistory,
  getKlines,
  getMarkets,
  getStoredCandles,
  providerStatus,
  searchMarkets,
} from "./lib/crypto/index.js";
import { CANONICAL_INTERVALS } from "./lib/crypto/interval.js";
import { getTickerPrice } from "./lib/crypto/price.js";
import { getNews, newsProviderStatus, refreshNews } from "./lib/news/index.js";
import { runBacktest } from "./lib/backtest/index.js";
import {
  autoTrade,
  closePosition,
  executeFromSignal,
  executerStatus,
  getOrders,
  getPositions,
  liveBalances,
  placeOrder,
  refreshPaperPositions,
  setKillSwitch,
} from "./lib/executer/index.js";
import { rugCheck } from "./lib/rug/index.js";
import {
  sizeFromSignal,
  sizeFromStoredSignals,
  sizePortfolio,
  sizeTrade,
} from "./lib/sizer/index.js";
import { analyzeSymbolMTF } from "./lib/signals/mtf.js";
import { scan } from "./lib/signals/screener.js";
import { getMovers } from "./lib/signals/universe.js";
import { ACTIONS, runAgent } from "./lib/agents.js";
import { startScheduler } from "./lib/scheduler.js";
import { attachWebSocket } from "./ws.js";

loadEnv();

const PORT = Number(process.env.PORT || 3001);
const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" } });

await app.register(fastifyCors, { origin: true });

/* ---------------- health & meta ---------------- */

app.get("/api/health", async () => ({ ok: true, uptime: process.uptime() }));

app.get("/api/providers", async () => providerStatus());

app.get("/api/intervals", async () => CANONICAL_INTERVALS);

app.get("/api/actions", async () => ACTIONS);

/* ---------------- markets ---------------- */

app.get("/api/markets", async (req, reply) => {
  const { q = "", limit = "500", refresh = "0" } = req.query || {};
  try {
    const markets = await getMarkets({ refresh: refresh === "1" });
    const symbols = searchMarkets(markets, q, Math.max(1, Math.min(Number(limit) || 500, 5000)));
    return {
      updatedAt: markets.updatedAt,
      total: markets.count,
      count: symbols.length,
      symbols,
    };
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

/* ---------------- candles ---------------- */

app.get("/api/klines", async (req, reply) => {
  const { symbol, interval = "1h", limit = "200", refresh = "0" } = req.query || {};
  if (!symbol) {
    reply.code(400);
    return { error: "symbol is required" };
  }
  try {
    return await getKlines({ symbol, interval, limit, refresh: refresh === "1" });
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.get("/api/history", async (req, reply) => {
  const { symbol, interval = "1h", days = "30" } = req.query || {};
  if (!symbol) {
    reply.code(400);
    return { error: "symbol is required" };
  }
  try {
    return await getHistory({ symbol, interval, days });
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.get("/api/price", async (req, reply) => {
  const { symbol } = req.query || {};
  if (!symbol) {
    reply.code(400);
    return { error: "symbol is required" };
  }
  try {
    return await getTickerPrice(symbol);
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.get("/api/candles", async (req, reply) => {  const { symbol, interval = "1h", limit = "500" } = req.query || {};
  if (!symbol) {
    reply.code(400);
    return { error: "symbol is required" };
  }
  const candles = getStoredCandles(symbol, interval, Number(limit) || 500);
  if (!candles.length) {
    reply.code(404);
    return { error: "no stored candles" };
  }
  return { symbol, interval, source: "db", count: candles.length, candles };
});

/* ---------------- datasets ---------------- */

app.get("/api/datasets", async () => listDatasets());

app.get("/api/dataset", async (req, reply) => {
  const { symbol, interval = "1h" } = req.query || {};
  if (!symbol) {
    reply.code(400);
    return { error: "symbol is required" };
  }
  const meta = getDataset(symbol, interval);
  if (!meta) {
    reply.code(404);
    return { error: "dataset not found" };
  }
  const candles = getStoredCandles(symbol, interval, 5000);
  return { ...meta, candles };
});

/* ---------------- agents ---------------- */

app.get("/api/agents", async () => listAgents());

app.post("/api/agents", async (req, reply) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const action = String(body.action || "").trim();

  if (!name) {
    reply.code(400);
    return { error: "name is required" };
  }
  if (!ACTIONS.includes(action)) {
    reply.code(400);
    return { error: `action must be one of: ${ACTIONS.join(", ")}` };
  }
  if (
    (action === "fetch-klines" || action === "fetch-history") &&
    !String(body.symbol || "").trim()
  ) {
    reply.code(400);
    return { error: "symbol is required for this action" };
  }

  const agent = {
    id: uid(),
    name,
    action,
    symbol: String(body.symbol || "").trim().toUpperCase(),
    interval: String(body.interval || "1h").trim(),
    limit: Math.max(1, Number(body.limit) || 200),
    days: Math.max(1, Number(body.days) || 30),
    intervalMinutes: Math.max(0, Number(body.intervalMinutes) || 0),
    enabled: body.enabled !== false,
    lastRunAt: null,
    createdAt: new Date().toISOString(),
  };
  insertAgent(agent);
  reply.code(201);
  return agent;
});

app.delete("/api/agents/:id", async (req, reply) => {
  const ok = deleteAgent(req.params.id);
  if (!ok) {
    reply.code(404);
    return { error: "not found" };
  }
  return { ok: true };
});

app.post("/api/agents/:id/run", async (req, reply) => {
  if (!getAgent(req.params.id)) {
    reply.code(404);
    return { error: "not found" };
  }
  try {
    const output = await runAgent(req.params.id, "manual");
    return { ok: true, output };
  } catch (err) {
    reply.code(502);
    return { ok: false, error: err.message };
  }
});

/* ---------------- news ---------------- */

app.get("/api/news", async (req) => {
  const { limit = "50", source = "", q = "" } = req.query || {};
  const articles = getNews({ limit, source, q });
  return {
    total: countNews(),
    count: articles.length,
    articles,
    sources: newsProviderStatus(),
  };
});

app.get("/api/news/sources", async () => newsProviderStatus());

app.post("/api/news/refresh", async (req, reply) => {
  const source = String(req.body?.source || "");
  try {
    return await refreshNews({ source });
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

/* ---------------- signals ---------------- */

app.get("/api/signals", async (req) => {
  const { limit = "50", direction = "", minScore = "0" } = req.query || {};
  const signals = listSignals({ limit, direction, minScore });
  return { generatedAt: Date.now(), count: signals.length, signals };
});

app.get("/api/signal", async (req, reply) => {
  const { symbol, interval = "1h" } = req.query || {};
  if (!symbol) {
    reply.code(400);
    return { error: "symbol is required" };
  }
  try {
    const signal = await analyzeSymbolMTF(symbol, interval);
    if (!signal) {
      reply.code(422);
      return { error: "not enough candle data to analyze this symbol" };
    }
    if (signal.direction !== "neutral") saveSignals([signal]);
    return signal;
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.get("/api/movers", async (req, reply) => {
  const { limit = "15", minVolumeQuote = "1000000" } = req.query || {};
  try {
    return { movers: await getMovers({ limit, minVolumeQuote }) };
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.post("/api/scan", async (req, reply) => {
  const body = req.body || {};
  try {
    return await scan({
      interval: body.interval || "5m",
      limit: body.limit,
      minScore: body.minScore,
      minVolumeQuote: body.minVolumeQuote,
      oi: body.oi !== false,
    });
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

/* ---------------- backtesting ---------------- */

app.post("/api/backtest", async (req, reply) => {
  const body = req.body || {};
  try {
    const result = await runBacktest({
      symbol: body.symbol,
      interval: body.interval || "5m",
      days: body.days,
      minScore: body.minScore,
      stopAtr: body.stopAtr,
      tpAtr: body.tpAtr,
    });
    const saved = saveBacktest(result);
    return { ...result, id: saved.id, createdAt: saved.createdAt };
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.get("/api/backtests", async () => listBacktests());

app.get("/api/backtest/:id", async (req, reply) => {
  const run = getBacktest(req.params.id);
  if (!run) {
    reply.code(404);
    return { error: "not found" };
  }
  return run;
});

/* ---------------- position sizing ---------------- */

app.post("/api/size", async (req, reply) => {
  try {
    return sizeTrade(req.body || {});
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/size/signal", async (req, reply) => {
  const body = req.body || {};
  try {
    return await sizeFromSignal({
      symbol: body.symbol,
      interval: body.interval || "5m",
      equity: body.equity,
      riskPct: body.riskPct,
      feePct: body.feePct,
      maxLeverage: body.maxLeverage,
      scaleByConfidence: body.scaleByConfidence !== false,
    });
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/size/portfolio", async (req, reply) => {
  const body = req.body || {};
  try {
    if (Array.isArray(body.trades) && body.trades.length) {
      return sizePortfolio(body);
    }
    return sizeFromStoredSignals({
      equity: body.equity,
      riskPct: body.riskPct,
      maxTotalRiskPct: body.maxTotalRiskPct,
      limit: body.limit,
      scaleByConfidence: body.scaleByConfidence !== false,
      feePct: body.feePct,
      maxLeverage: body.maxLeverage,
    });
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

/* ---------------- executer ---------------- */

app.get("/api/executer/status", async () => executerStatus());

app.get("/api/executer/orders", async (req) => {
  const { limit = "50" } = req.query || {};
  return getOrders(limit);
});

app.get("/api/executer/positions", async (req) => {
  const { status = "", limit = "100" } = req.query || {};
  return getPositions({ status, limit });
});

app.post("/api/executer/order", async (req, reply) => {
  try {
    return await placeOrder(req.body || {});
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/executer/from-signal", async (req, reply) => {
  const body = req.body || {};
  try {
    return await executeFromSignal({
      symbol: body.symbol,
      interval: body.interval || "5m",
      equity: body.equity,
      riskPct: body.riskPct,
      feePct: body.feePct,
      maxLeverage: body.maxLeverage,
      mode: body.mode,
      confirm: !!body.confirm,
    });
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/executer/positions/:id/close", async (req, reply) => {
  try {
    return await closePosition(req.params.id, req.body?.price);
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/executer/kill", async (req) => {
  return { killSwitch: setKillSwitch(!!req.body?.enabled) };
});

app.post("/api/executer/auto", async (req, reply) => {
  const body = req.body || {};
  try {
    return await autoTrade({
      equity: body.equity,
      riskPct: body.riskPct,
      interval: body.interval || "5m",
      limit: body.limit,
      mode: body.mode,
      confirm: !!body.confirm,
    });
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.get("/api/executer/balance", async (req, reply) => {
  try {
    return await liveBalances();
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
});

app.post("/api/executer/reset", async () => {
  resetPaperTrading();
  return { ok: true, resetAt: Date.now() };
});

/* ---------------- rug check ---------------- */

app.get("/api/rugcheck", async (req, reply) => {
  const { address = "", chain = "", refresh = "0" } = req.query || {};
  if (!address) {
    reply.code(400);
    return { error: "address is required" };
  }
  try {
    return await rugCheck({ address, chain, refresh: refresh === "1" });
  } catch (err) {
    reply.code(502);
    return { error: err.message };
  }
});

app.get("/api/rugchecks", async (req) => {
  const { limit = "50" } = req.query || {};
  return listRugChecks(limit);
});

/* ---------------- logs ---------------- */

app.get("/api/logs", async () => listLogs());

/* ---------------- static client (production build) ---------------- */

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
attachWebSocket(app.server);
startScheduler();

setInterval(() => {
  refreshPaperPositions().catch(() => {});
}, 10_000);

const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./lib/env.js";

if (!existsSync(paths.data)) mkdirSync(paths.data, { recursive: true });

export const db = new DatabaseSync(join(paths.data, "app.db"));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    tf TEXT NOT NULL,
    open_time INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    source TEXT,
    PRIMARY KEY (symbol, tf, open_time)
  );
  CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles (symbol, tf, open_time);

  CREATE TABLE IF NOT EXISTS datasets (
    symbol TEXT NOT NULL,
    tf TEXT NOT NULL,
    source TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (symbol, tf)
  );

  CREATE TABLE IF NOT EXISTS markets (
    symbol TEXT PRIMARY KEY,
    base TEXT,
    quote TEXT,
    providers TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    action TEXT NOT NULL,
    symbol TEXT,
    tf TEXT,
    limit_n INTEGER,
    days INTEGER,
    interval_minutes INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    agent_id TEXT,
    agent_name TEXT,
    run_trigger TEXT,
    status TEXT,
    output TEXT,
    ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    source_name TEXT,
    title TEXT NOT NULL,
    link TEXT,
    summary TEXT,
    published_at INTEGER,
    fetched_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_news_published ON news (published_at DESC);
`);

const s = {
  upsertCandle: db.prepare(`
    INSERT INTO candles (symbol, tf, open_time, open, high, low, close, volume, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, tf, open_time) DO UPDATE SET
      open = excluded.open, high = excluded.high, low = excluded.low,
      close = excluded.close, volume = excluded.volume, source = excluded.source
  `),
  countCandles: db.prepare(`SELECT COUNT(*) AS c FROM candles WHERE symbol = ? AND tf = ?`),
  upsertDataset: db.prepare(`
    INSERT INTO datasets (symbol, tf, source, count, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol, tf) DO UPDATE SET
      source = excluded.source, count = excluded.count, updated_at = excluded.updated_at
  `),
  candlesDesc: db.prepare(`
    SELECT open_time AS t, open AS o, high AS h, low AS l, close AS c, volume AS v
    FROM candles WHERE symbol = ? AND tf = ?
    ORDER BY open_time DESC LIMIT ?
  `),
  candleRange: db.prepare(`
    SELECT open_time AS t, open AS o, high AS h, low AS l, close AS c, volume AS v
    FROM candles WHERE symbol = ? AND tf = ? AND open_time >= ?
    ORDER BY open_time ASC
  `),
  listDatasets: db.prepare(`
    SELECT symbol, tf AS interval, source, count, updated_at AS updatedAt
    FROM datasets ORDER BY updated_at DESC
  `),
  getDataset: db.prepare(`
    SELECT symbol, tf AS interval, source, count, updated_at AS updatedAt
    FROM datasets WHERE symbol = ? AND tf = ?
  `),

  clearMarkets: db.prepare(`DELETE FROM markets`),
  insertMarket: db.prepare(`
    INSERT OR REPLACE INTO markets (symbol, base, quote, providers, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  listMarkets: db.prepare(`SELECT symbol, base, quote, providers, updated_at AS updatedAt FROM markets`),
  marketsMeta: db.prepare(`SELECT MAX(updated_at) AS updatedAt, COUNT(*) AS count FROM markets`),

  listAgents: db.prepare(`SELECT * FROM agents ORDER BY created_at ASC`),
  getAgent: db.prepare(`SELECT * FROM agents WHERE id = ?`),
  insertAgent: db.prepare(`
    INSERT INTO agents
      (id, name, action, symbol, tf, limit_n, days, interval_minutes, enabled, last_run_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteAgent: db.prepare(`DELETE FROM agents WHERE id = ?`),
  touchAgent: db.prepare(`UPDATE agents SET last_run_at = ? WHERE id = ?`),

  insertLog: db.prepare(`
    INSERT INTO logs (time, agent_id, agent_name, run_trigger, status, output, ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  pruneLogs: db.prepare(`
    DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 200)
  `),
  listLogs: db.prepare(`
    SELECT time, agent_id AS agentId, agent_name AS agentName,
           run_trigger AS trigger, status, output, ms
    FROM logs ORDER BY id DESC LIMIT 200
  `),

  insertNews: db.prepare(`
    INSERT OR IGNORE INTO news
      (id, source_id, source_name, title, link, summary, published_at, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  countNews: db.prepare(`SELECT COUNT(*) AS c FROM news`),
};

function toCandle(r) {
  return { t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v };
}

export function upsertCandles(symbol, interval, candles, source) {
  if (!candles?.length) return 0;
  db.exec("BEGIN");
  try {
    for (const c of candles) {
      s.upsertCandle.run(symbol, interval, c.t, c.o, c.h, c.l, c.c, c.v ?? 0, source ?? null);
    }
    const count = s.countCandles.get(symbol, interval).c;
    s.upsertDataset.run(symbol, interval, source ?? null, count, Date.now());
    db.exec("COMMIT");
    return count;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getCandles(symbol, interval, limit = 500) {
  return s.candlesDesc.all(symbol, interval, limit).map(toCandle).reverse();
}

export function getCandlesRange(symbol, interval, from) {
  return s.candleRange.all(symbol, interval, from).map(toCandle);
}

export function getDataset(symbol, interval) {
  return s.getDataset.get(symbol, interval) || null;
}

export function listDatasets() {
  return s.listDatasets.all();
}

export function saveMarkets(list, updatedAt = Date.now()) {
  db.exec("BEGIN");
  try {
    s.clearMarkets.run();
    for (const m of list) {
      s.insertMarket.run(m.symbol, m.base, m.quote, JSON.stringify(m.providers || {}), updatedAt);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getMarketsMeta() {
  const meta = s.marketsMeta.get();
  if (!meta || !meta.count) return null;
  const list = s.listMarkets.all().map((m) => ({
    symbol: m.symbol,
    base: m.base,
    quote: m.quote,
    providers: safeParse(m.providers),
  }));
  return { updatedAt: meta.updatedAt, count: meta.count, list };
}

function safeParse(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function toAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    action: row.action,
    symbol: row.symbol || "",
    interval: row.tf || "1h",
    limit: row.limit_n || 200,
    days: row.days || 30,
    intervalMinutes: row.interval_minutes || 0,
    enabled: !!row.enabled,
    lastRunAt: row.last_run_at || null,
    createdAt: row.created_at,
  };
}

export function listAgents() {
  return s.listAgents.all().map(toAgent);
}

export function getAgent(id) {
  return toAgent(s.getAgent.get(id));
}

export function insertAgent(agent) {
  s.insertAgent.run(
    agent.id,
    agent.name,
    agent.action,
    agent.symbol || null,
    agent.interval || "1h",
    agent.limit || 200,
    agent.days || 30,
    agent.intervalMinutes || 0,
    agent.enabled ? 1 : 0,
    agent.lastRunAt || null,
    agent.createdAt
  );
  return agent;
}

export function deleteAgent(id) {
  return s.deleteAgent.run(id).changes > 0;
}

export function touchAgent(id, when) {
  s.touchAgent.run(when, id);
}

export function addLog(entry) {
  s.insertLog.run(
    entry.time || new Date().toISOString(),
    entry.agentId || null,
    entry.agentName || null,
    entry.trigger || "manual",
    entry.status || "success",
    entry.output || "",
    entry.ms ?? 0
  );
  s.pruneLogs.run();
}

export function listLogs() {
  return s.listLogs.all();
}

export function upsertNews(articles) {
  if (!articles?.length) return 0;
  db.exec("BEGIN");
  try {
    let inserted = 0;
    for (const a of articles) {
      const result = s.insertNews.run(
        a.id,
        a.sourceId,
        a.sourceName,
        a.title,
        a.link || "",
        a.summary || "",
        a.publishedAt || Date.now(),
        a.fetchedAt || Date.now()
      );
      inserted += result.changes;
    }
    db.exec("COMMIT");
    return inserted;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function countNews() {
  return s.countNews.get().c;
}

export function listNews({ limit = 50, source = "", q = "" } = {}) {
  const clauses = [];
  const params = [];

  if (source) {
    clauses.push("source_id = ?");
    params.push(source);
  }
  if (q) {
    clauses.push("(title LIKE ? OR summary LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const capped = Math.max(1, Math.min(Number(limit) || 50, 500));

  const rows = db
    .prepare(
      `SELECT id, source_id AS sourceId, source_name AS sourceName, title, link,
              summary, published_at AS publishedAt, fetched_at AS fetchedAt
       FROM news ${where}
       ORDER BY published_at DESC LIMIT ?`
    )
    .all(...params, capped);

  return rows;
}

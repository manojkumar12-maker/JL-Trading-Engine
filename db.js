import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
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

  CREATE TABLE IF NOT EXISTS signals (
    symbol TEXT NOT NULL,
    tf TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    price REAL,
    score REAL,
    direction TEXT,
    confidence INTEGER,
    entry REAL,
    stop REAL,
    targets TEXT,
    reasons TEXT,
    indicators TEXT,
    source TEXT,
    change_pct REAL,
    quote_volume REAL,
    oi_change_pct REAL,
    heat REAL,
    PRIMARY KEY (symbol, tf)
  );
`);

try {
  db.exec("ALTER TABLE signals ADD COLUMN meta TEXT");
} catch {
  /* column already exists */
}

db.exec(`
  CREATE TABLE IF NOT EXISTS backtests (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    symbol TEXT,
    tf TEXT,
    days INTEGER,
    params TEXT,
    summary TEXT,
    by_direction TEXT,
    trades TEXT,
    equity TEXT
  );

  CREATE TABLE IF NOT EXISTS rugchecks (
    address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    score REAL,
    verdict TEXT,
    data TEXT,
    PRIMARY KEY (address, chain)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    mode TEXT,
    exchange TEXT,
    symbol TEXT,
    side TEXT,
    type TEXT,
    quantity REAL,
    price REAL,
    notional REAL,
    stop REAL,
    take_profit REAL,
    status TEXT,
    source TEXT,
    filled_price REAL,
    filled_at INTEGER,
    error TEXT,
    raw TEXT
  );

  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    symbol TEXT,
    side TEXT,
    quantity REAL,
    entry REAL,
    stop REAL,
    take_profit REAL,
    status TEXT,
    mode TEXT,
    opened_at INTEGER,
    closed_at INTEGER,
    exit_price REAL,
    pnl REAL,
    fee REAL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER NOT NULL,
    level TEXT,
    category TEXT,
    event TEXT,
    message TEXT,
    data TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_time ON events (time DESC);
`);

try {
  db.exec("ALTER TABLE positions ADD COLUMN fee REAL");
} catch {
  /* column already exists */
}

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

  upsertSignal: db.prepare(`
    INSERT INTO signals
      (symbol, tf, created_at, price, score, direction, confidence, entry, stop,
       targets, reasons, indicators, source, change_pct, quote_volume, oi_change_pct, heat, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, tf) DO UPDATE SET
      created_at = excluded.created_at, price = excluded.price, score = excluded.score,
      direction = excluded.direction, confidence = excluded.confidence,
      entry = excluded.entry, stop = excluded.stop, targets = excluded.targets,
      reasons = excluded.reasons, indicators = excluded.indicators, source = excluded.source,
      change_pct = excluded.change_pct, quote_volume = excluded.quote_volume,
      oi_change_pct = excluded.oi_change_pct, heat = excluded.heat, meta = excluded.meta
  `),

  insertBacktest: db.prepare(`
    INSERT INTO backtests
      (id, created_at, symbol, tf, days, params, summary, by_direction, trades, equity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listBacktests: db.prepare(`
    SELECT id, created_at AS createdAt, symbol, tf AS interval, days, params, summary
    FROM backtests ORDER BY created_at DESC LIMIT 100
  `),
  getBacktest: db.prepare(`
    SELECT id, created_at AS createdAt, symbol, tf AS interval, days, params, summary,
           by_direction AS byDirection, trades, equity
    FROM backtests WHERE id = ?
  `),

  upsertRugCheck: db.prepare(`
    INSERT INTO rugchecks (address, chain, created_at, score, verdict, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(address, chain) DO UPDATE SET
      created_at = excluded.created_at, score = excluded.score,
      verdict = excluded.verdict, data = excluded.data
  `),
  getRugCheck: db.prepare(`
    SELECT address, chain, created_at AS createdAt, score, verdict, data
    FROM rugchecks WHERE address = ? AND chain = ?
  `),
  listRugChecks: db.prepare(`
    SELECT address, chain, created_at AS createdAt, score, verdict
    FROM rugchecks ORDER BY created_at DESC LIMIT ?
  `),

  insertOrder: db.prepare(`
    INSERT INTO orders
      (id, created_at, mode, exchange, symbol, side, type, quantity, price, notional,
       stop, take_profit, status, source, filled_price, filled_at, error, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateOrder: db.prepare(`
    UPDATE orders SET status = ?, filled_price = ?, filled_at = ?, error = ?, raw = ? WHERE id = ?
  `),
  listOrders: db.prepare(`
    SELECT id, created_at AS createdAt, mode, exchange, symbol, side, type, quantity, price,
           notional, stop, take_profit AS takeProfit, status, source,
           filled_price AS filledPrice, filled_at AS filledAt, error
    FROM orders ORDER BY created_at DESC LIMIT ?
  `),

  insertPosition: db.prepare(`
    INSERT INTO positions
      (id, order_id, symbol, side, quantity, entry, stop, take_profit, status, mode,
       opened_at, closed_at, exit_price, pnl)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updatePosition: db.prepare(`
    UPDATE positions SET status = ?, closed_at = ?, exit_price = ?, pnl = ?, fee = ? WHERE id = ?
  `),
  getPosition: db.prepare(`
    SELECT id, order_id AS orderId, symbol, side, quantity, entry, stop,
           take_profit AS takeProfit, status, mode, opened_at AS openedAt,
           closed_at AS closedAt, exit_price AS exitPrice, pnl, fee
    FROM positions WHERE id = ?
  `),
  listPositions: db.prepare(`
    SELECT id, order_id AS orderId, symbol, side, quantity, entry, stop,
           take_profit AS takeProfit, status, mode, opened_at AS openedAt,
           closed_at AS closedAt, exit_price AS exitPrice, pnl, fee
    FROM positions ORDER BY opened_at DESC LIMIT ?
  `),
  listOpenPositions: db.prepare(`
    SELECT id, order_id AS orderId, symbol, side, quantity, entry, stop,
           take_profit AS takeProfit, status, mode, opened_at AS openedAt,
           closed_at AS closedAt, exit_price AS exitPrice, pnl, fee
    FROM positions WHERE status = 'open'
  `),
  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  setSetting: db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
  dailyPnl: db.prepare(`
    SELECT COALESCE(SUM(pnl), 0) AS p FROM positions WHERE status = 'closed' AND closed_at >= ?
  `),

  insertEvent: db.prepare(`
    INSERT INTO events (time, level, category, event, message, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  pruneEvents: db.prepare(`
    DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 5000)
  `),
  clearEvents: db.prepare(`DELETE FROM events`),
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

export function saveSignals(list) {
  if (!list?.length) return 0;
  db.exec("BEGIN");
  try {
    for (const sig of list) {
      s.upsertSignal.run(
        sig.symbol,
        sig.interval || "1h",
        sig.updatedAt || Date.now(),
        sig.price ?? null,
        sig.score ?? null,
        sig.direction ?? null,
        sig.confidence ?? null,
        sig.plan?.entry ?? null,
        sig.plan?.stop ?? null,
        JSON.stringify(sig.plan?.targets || []),
        JSON.stringify(sig.reasons || []),
        JSON.stringify(sig.indicators || {}),
        sig.source ?? null,
        sig.changePct ?? null,
        sig.quoteVolume ?? null,
        sig.oiChangePct ?? null,
        sig.heat ?? null,
        JSON.stringify({
          timeframes: sig.timeframes || [],
          layers: sig.layers || [],
          alignment: sig.alignment || null,
          biasScore: sig.biasScore ?? null,
          news: sig.news || null,
          higherTrend: sig.higherTrend ?? null,
        })
      );
    }
    db.exec("COMMIT");
    return list.length;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listSignals({ limit = 50, direction = "", minScore = 0 } = {}) {
  const clauses = [];
  const params = [];

  if (direction) {
    clauses.push("direction = ?");
    params.push(direction);
  }

  const threshold = Number(minScore) || 0;
  if (threshold > 0) {
    clauses.push("(score >= ? OR score <= ?)");
    params.push(threshold, -threshold);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const capped = Math.max(1, Math.min(Number(limit) || 50, 500));

  const rows = db
    .prepare(
      `SELECT symbol, tf AS interval, created_at AS updatedAt, price, score, direction,
              confidence, entry, stop, targets, reasons, indicators, source,
              change_pct AS changePct, quote_volume AS quoteVolume,
              oi_change_pct AS oiChangePct, heat, meta
       FROM signals ${where}
       ORDER BY ABS(score) * confidence DESC LIMIT ?`
    )
    .all(...params, capped);

  return rows.map((row) => {
    const { meta, ...rest } = row;
    const extra = safeParse(meta) || {};
    return {
      ...rest,
      targets: safeParse(row.targets),
      reasons: safeParse(row.reasons),
      indicators: safeParse(row.indicators),
      timeframes: extra.timeframes || [],
      layers: extra.layers || [],
      alignment: extra.alignment || null,
      biasScore: extra.biasScore ?? null,
      news: extra.news || null,
      higherTrend: extra.higherTrend ?? null,
      plan:
        row.entry == null
          ? null
          : {
              entry: row.entry,
              stop: row.stop,
              targets: safeParse(row.targets),
            },
    };
  });
}

export function saveBacktest(run) {
  const id = randomUUID();
  const createdAt = Date.now();
  s.insertBacktest.run(
    id,
    createdAt,
    run.symbol,
    run.interval,
    run.days,
    JSON.stringify(run.params || {}),
    JSON.stringify(run.summary || {}),
    JSON.stringify(run.byDirection || []),
    JSON.stringify(run.trades || []),
    JSON.stringify(run.equity || [])
  );
  return { id, createdAt };
}

export function listBacktests() {
  return s.listBacktests.all().map((row) => ({
    ...row,
    params: safeParse(row.params),
    summary: safeParse(row.summary),
  }));
}

export function getBacktest(id) {
  const row = s.getBacktest.get(id);
  if (!row) return null;
  return {
    ...row,
    params: safeParse(row.params),
    summary: safeParse(row.summary),
    byDirection: safeParse(row.byDirection),
    trades: safeParse(row.trades),
    equity: safeParse(row.equity),
  };
}

export function saveRugCheck(result) {
  const chain = result.chain || "";
  s.upsertRugCheck.run(
    result.address,
    chain,
    result.createdAt || Date.now(),
    result.score ?? null,
    result.verdict ?? null,
    JSON.stringify(result)
  );
  return result;
}

export function getRugCheck(address, chain = "") {
  const row = s.getRugCheck.get(address, chain || "");
  if (!row) return null;
  return {
    createdAt: row.createdAt,
    score: row.score,
    verdict: row.verdict,
    data: safeParse(row.data),
  };
}

export function listRugChecks(limit = 50) {
  return s.listRugChecks.all(Math.max(1, Math.min(Number(limit) || 50, 200)));
}

export function saveOrder(order) {
  s.insertOrder.run(
    order.id,
    order.createdAt || Date.now(),
    order.mode || "paper",
    order.exchange || null,
    order.symbol || null,
    order.side || null,
    order.type || "MARKET",
    order.quantity ?? null,
    order.price ?? null,
    order.notional ?? null,
    order.stop ?? null,
    order.takeProfit ?? null,
    order.status || "new",
    order.source || "manual",
    order.filledPrice ?? null,
    order.filledAt ?? null,
    order.error ?? null,
    order.raw ? JSON.stringify(order.raw) : null
  );
  return order;
}

export function updateOrder(id, fields = {}) {
  s.updateOrder.run(
    fields.status ?? null,
    fields.filledPrice ?? null,
    fields.filledAt ?? null,
    fields.error ?? null,
    fields.raw ? JSON.stringify(fields.raw) : null,
    id
  );
}

export function listOrders(limit = 50) {
  return s.listOrders.all(Math.max(1, Math.min(Number(limit) || 50, 200)));
}

export function savePosition(position) {
  s.insertPosition.run(
    position.id,
    position.orderId || null,
    position.symbol,
    position.side,
    position.quantity,
    position.entry,
    position.stop ?? null,
    position.takeProfit ?? null,
    position.status || "open",
    position.mode || "paper",
    position.openedAt || Date.now(),
    position.closedAt ?? null,
    position.exitPrice ?? null,
    position.pnl ?? null
  );
  return position;
}

export function updatePosition(id, fields = {}) {
  s.updatePosition.run(
    fields.status || "closed",
    fields.closedAt ?? Date.now(),
    fields.exitPrice ?? null,
    fields.pnl ?? null,
    fields.fee ?? null,
    id
  );
}

export function getPositionById(id) {
  return s.getPosition.get(id) || null;
}

export function listPositions({ status = "", limit = 100 } = {}) {
  const capped = Math.max(1, Math.min(Number(limit) || 100, 200));
  if (status) {
    return db
      .prepare(
        `SELECT id, order_id AS orderId, symbol, side, quantity, entry, stop,
                take_profit AS takeProfit, status, mode, opened_at AS openedAt,
                closed_at AS closedAt, exit_price AS exitPrice, pnl, fee
         FROM positions WHERE status = ? ORDER BY opened_at DESC LIMIT ?`
      )
      .all(status, capped);
  }
  return s.listPositions.all(capped);
}

export function listOpenPositions() {
  return s.listOpenPositions.all();
}

export function getSetting(key, fallback = null) {
  const row = s.getSetting.get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  s.setSetting.run(key, String(value));
  return String(value);
}

export function dailyRealizedPnl() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return s.dailyPnl.get(start.getTime()).p;
}

export function resetPaperTrading() {
  db.exec("DELETE FROM positions WHERE mode = 'paper'");
  db.exec("DELETE FROM orders WHERE mode = 'paper'");
}

export function addEvent(entry) {
  s.insertEvent.run(
    entry.time || Date.now(),
    entry.level || "info",
    entry.category || "system",
    entry.event || "event",
    String(entry.message || "").slice(0, 800),
    entry.data ?? null
  );
  s.pruneEvents.run();
}

export function listEvents({
  limit = 200,
  level = "",
  category = "",
  q = "",
  since = 0,
} = {}) {
  const clauses = [];
  const params = [];

  if (level) {
    clauses.push("level = ?");
    params.push(level);
  }
  if (category) {
    clauses.push("category = ?");
    params.push(category);
  }
  if (Number(since) > 0) {
    clauses.push("time >= ?");
    params.push(Number(since));
  }
  if (q) {
    clauses.push("(message LIKE ? OR event LIKE ? OR data LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const capped = Math.max(1, Math.min(Number(limit) || 200, 1000));

  return db
    .prepare(
      `SELECT id, time, level, category, event, message, data
       FROM events ${where} ORDER BY id DESC LIMIT ?`
    )
    .all(...params, capped);
}

export function clearEvents() {
  s.clearEvents.run();
}

export function eventSummary() {
  const since = Date.now() - 86_400_000;
  const total = db.prepare("SELECT COUNT(*) AS c FROM events").get().c;
  const byCategory = db
    .prepare("SELECT category, COUNT(*) AS c FROM events WHERE time >= ? GROUP BY category")
    .all(since);
  const byLevel = db
    .prepare("SELECT level, COUNT(*) AS c FROM events WHERE time >= ? GROUP BY level")
    .all(since);
  return { total, since, byCategory, byLevel };
}

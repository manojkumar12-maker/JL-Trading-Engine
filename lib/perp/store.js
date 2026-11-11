import { randomUUID } from "node:crypto";
import { db } from "../../db.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS perp_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS perp_positions (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    entry REAL NOT NULL,
    weight REAL,
    status TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    closed_at INTEGER,
    exit_price REAL,
    pnl REAL,
    fee REAL,
    reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_perp_positions_status ON perp_positions (status);

  CREATE TABLE IF NOT EXISTS perp_runs (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    equity REAL,
    exposure REAL,
    positions INTEGER,
    targets TEXT,
    notes TEXT
  );
`);

const s = {
  getState: db.prepare(`SELECT value FROM perp_state WHERE key = ?`),
  setState: db.prepare(`
    INSERT INTO perp_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
  insertPosition: db.prepare(`
    INSERT INTO perp_positions (
      id, symbol, side, quantity, entry, weight, status, opened_at,
      closed_at, exit_price, pnl, fee, reason
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, NULL, NULL, NULL, ?, ?)
  `),
  closePosition: db.prepare(`
    UPDATE perp_positions SET status = 'closed', closed_at = ?, exit_price = ?,
      pnl = ?, fee = COALESCE(fee, 0) + ?, reason = ?
    WHERE id = ?
  `),
  listOpen: db.prepare(`SELECT * FROM perp_positions WHERE status = 'open' ORDER BY opened_at`),
  listAll: db.prepare(`SELECT * FROM perp_positions ORDER BY opened_at DESC LIMIT ?`),
  clearPositions: db.prepare(`DELETE FROM perp_positions`),
  clearRuns: db.prepare(`DELETE FROM perp_runs`),
  insertRun: db.prepare(`
    INSERT INTO perp_runs (id, created_at, equity, exposure, positions, targets, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  listRuns: db.prepare(`SELECT * FROM perp_runs ORDER BY created_at DESC LIMIT ?`),
};

export function getPerpState(key, fallback = null) {
  const row = s.getState.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export function setPerpState(key, value) {
  s.setState.run(key, JSON.stringify(value));
  return value;
}

export function openPerpPosition(position) {
  const id = randomUUID();
  s.insertPosition.run(
    id,
    position.symbol,
    position.side || "long",
    Number(position.quantity),
    Number(position.entry),
    Number(position.weight) || 0,
    Date.now(),
    Number(position.fee) || 0,
    position.reason || "rebalance"
  );
  return id;
}

export function closePerpPosition(id, { exitPrice, pnl, fee, reason }) {
  s.closePosition.run(Date.now(), exitPrice, pnl, fee || 0, reason || "rebalance", id);
}

export function listOpenPerpPositions() {
  return s.listOpen.all();
}

export function listPerpPositions(limit = 100) {
  return s.listAll.all(limit);
}

export function clearPerpPositions() {
  s.clearPositions.run();
}

export function recordPerpRun(run) {
  const id = randomUUID();
  s.insertRun.run(
    id,
    Date.now(),
    run.equity ?? null,
    run.exposure ?? null,
    run.positions ?? null,
    JSON.stringify(run.targets || []),
    run.notes || null
  );
  return id;
}

export function listPerpRuns(limit = 20) {
  return s.listRuns.all(limit).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    equity: row.equity,
    exposure: row.exposure,
    positions: row.positions,
    targets: safeParse(row.targets),
    notes: row.notes,
  }));
}

export function resetPerpStore() {
  s.clearPositions.run();
  s.clearRuns.run();
}

function safeParse(value) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

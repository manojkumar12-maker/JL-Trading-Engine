import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./lib/env.js";

if (!existsSync(paths.data)) mkdirSync(paths.data, { recursive: true });

export const db = new DatabaseSync(join(paths.data, "app.db"));

db.exec(`
  PRAGMA journal_mode = WAL;

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

const insertEvent = db.prepare(`
  INSERT INTO events (time, level, category, event, message, data)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const pruneEvents = db.prepare(`DELETE FROM events WHERE id NOT IN (
  SELECT id FROM events ORDER BY id DESC LIMIT 5000
)`);

export function addEvent(entry) {
  insertEvent.run(
    entry.time || Date.now(),
    entry.level || "info",
    entry.category || "system",
    entry.event || "event",
    String(entry.message || "").slice(0, 800),
    entry.data ?? null
  );
  pruneEvents.run();
}

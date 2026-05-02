/**
 * SQLite-backed local store. Used to:
 *  - persist notification rules between restarts
 *  - keep a log of sent notifications (for the UI history page)
 *  - cache the most recent farm snapshot (so the UI is fast even between polls)
 *  - track which "ready" events we've already notified about to avoid spam
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { NotificationLog, NotificationRule } from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = path.resolve(config.database.path);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS notification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      target TEXT,
      threshold REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      success INTEGER NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS farm_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      fetched_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    /* Tracks which (kind, key) events we already notified about so we don't
       re-send the same "Sunflower plot 7 ready" message every poll. */
    CREATE TABLE IF NOT EXISTS notified_events (
      key TEXT PRIMARY KEY,
      first_notified_at INTEGER NOT NULL
    );

    /* Historical P2P price snapshots from sfl.world, appended every poll
       so we can render sparkline trends and compute 24h % change. */
    CREATE TABLE IF NOT EXISTS price_snapshots (
      item TEXT NOT NULL,
      price REAL NOT NULL,
      taken_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_item_time
      ON price_snapshots (item, taken_at);
  `);

  // Migrate legacy rule names from earlier versions of this app.
  d.prepare("UPDATE notification_rules SET kind = 'animal_ready' WHERE kind = 'animal_hungry'").run();

  // Seed default rules on first run.
  const count = d.prepare("SELECT COUNT(*) AS n FROM notification_rules").get() as { n: number };
  if (count.n === 0) {
    const now = Date.now();
    const insert = d.prepare(
      "INSERT INTO notification_rules (kind, target, threshold, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
    );
    insert.run("harvest_ready", null, null, now);
    insert.run("animal_ready", null, null, now);
    insert.run("resource_ready", null, null, now);
    insert.run("daily_reward", null, null, now);
  }
}

// ---------- Rules ----------

export function listRules(): NotificationRule[] {
  return getDb()
    .prepare("SELECT id, kind, target, threshold, enabled, created_at as createdAt FROM notification_rules ORDER BY id")
    .all() as NotificationRule[];
}

export function setRuleEnabled(id: number, enabled: boolean): void {
  getDb().prepare("UPDATE notification_rules SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function addRule(input: Omit<NotificationRule, "id" | "createdAt">): NotificationRule {
  const now = Date.now();
  const result = getDb()
    .prepare(
      "INSERT INTO notification_rules (kind, target, threshold, enabled, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.kind, input.target ?? null, input.threshold ?? null, input.enabled, now);
  return {
    id: Number(result.lastInsertRowid),
    kind: input.kind,
    target: input.target,
    threshold: input.threshold,
    enabled: input.enabled,
    createdAt: now,
  };
}

export function deleteRule(id: number): void {
  getDb().prepare("DELETE FROM notification_rules WHERE id = ?").run(id);
}

// ---------- Log ----------

export function logNotification(entry: {
  ruleId: number | null;
  kind: string;
  message: string;
  success: boolean;
  error?: string | null;
}): void {
  getDb()
    .prepare(
      "INSERT INTO notification_log (rule_id, kind, message, sent_at, success, error) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      entry.ruleId,
      entry.kind,
      entry.message,
      Date.now(),
      entry.success ? 1 : 0,
      entry.error ?? null,
    );
}

export function listLog(limit = 100): NotificationLog[] {
  return getDb()
    .prepare(
      "SELECT id, rule_id as ruleId, kind, message, sent_at as sentAt, success, error FROM notification_log ORDER BY sent_at DESC LIMIT ?",
    )
    .all(limit) as NotificationLog[];
}

// ---------- Snapshot cache ----------

export function saveSnapshot(payload: unknown): void {
  getDb()
    .prepare(
      "INSERT INTO farm_snapshot (id, fetched_at, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload",
    )
    .run(Date.now(), JSON.stringify(payload));
}

export function loadSnapshot<T = unknown>(): { fetchedAt: number; payload: T } | null {
  const row = getDb()
    .prepare("SELECT fetched_at as fetchedAt, payload FROM farm_snapshot WHERE id = 1")
    .get() as { fetchedAt: number; payload: string } | undefined;
  if (!row) return null;
  return { fetchedAt: row.fetchedAt, payload: JSON.parse(row.payload) as T };
}

// ---------- De-dup notified events ----------

/** Returns true if this is the first time we see `key`, otherwise false. */
export function markNotifiedOnce(key: string): boolean {
  const stmt = getDb().prepare(
    "INSERT OR IGNORE INTO notified_events (key, first_notified_at) VALUES (?, ?)",
  );
  const result = stmt.run(key, Date.now());
  return result.changes > 0;
}

/** Clears event keys whose prefix is `prefix:` (e.g. when crop replanted). */
export function clearNotifiedByPrefix(prefix: string): void {
  getDb().prepare("DELETE FROM notified_events WHERE key LIKE ?").run(`${prefix}:%`);
}

// ---------- Price snapshots ----------

/** Bulk-insert a set of item→price samples taken at the same instant. */
export function insertPriceSnapshots(
  prices: Record<string, number>,
  takenAt: number = Date.now(),
): void {
  const d = getDb();
  const stmt = d.prepare(
    "INSERT INTO price_snapshots (item, price, taken_at) VALUES (?, ?, ?)",
  );
  const tx = d.transaction((entries: [string, number][]) => {
    for (const [item, price] of entries) {
      if (price > 0 && Number.isFinite(price)) stmt.run(item, price, takenAt);
    }
  });
  tx(Object.entries(prices));
}

export interface PriceSample {
  price: number;
  takenAt: number;
}

/** Returns raw samples for a single item since `sinceMs` (inclusive). */
export function getPriceHistory(item: string, sinceMs: number): PriceSample[] {
  return getDb()
    .prepare(
      "SELECT price, taken_at as takenAt FROM price_snapshots WHERE item = ? AND taken_at >= ? ORDER BY taken_at ASC",
    )
    .all(item, sinceMs) as PriceSample[];
}

/** Bulk-fetch history for many items at once. */
export function getPriceHistoryBulk(
  items: string[],
  sinceMs: number,
): Record<string, PriceSample[]> {
  if (items.length === 0) return {};
  const placeholders = items.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT item, price, taken_at as takenAt FROM price_snapshots
       WHERE item IN (${placeholders}) AND taken_at >= ?
       ORDER BY taken_at ASC`,
    )
    .all(...items, sinceMs) as { item: string; price: number; takenAt: number }[];
  const out: Record<string, PriceSample[]> = {};
  for (const it of items) out[it] = [];
  for (const r of rows) out[r.item].push({ price: r.price, takenAt: r.takenAt });
  return out;
}

/** Deletes snapshots older than `olderThanMs` to keep the DB lean. */
export function prunePriceSnapshots(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs;
  const res = getDb()
    .prepare("DELETE FROM price_snapshots WHERE taken_at < ?")
    .run(cutoff);
  return res.changes;
}

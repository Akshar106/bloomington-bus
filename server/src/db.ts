import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { config } from "./config.ts";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Static schedule (replaced on every import)
CREATE TABLE IF NOT EXISTS routes (
  route_id TEXT PRIMARY KEY, short_name TEXT NOT NULL, long_name TEXT NOT NULL,
  color TEXT NOT NULL, text_color TEXT NOT NULL, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stops (
  stop_id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  trip_id TEXT PRIMARY KEY, route_id TEXT NOT NULL, service_id TEXT NOT NULL,
  headsign TEXT NOT NULL, direction_id INTEGER
);
CREATE TABLE IF NOT EXISTS stop_times (
  trip_id TEXT NOT NULL, stop_sequence INTEGER NOT NULL, stop_id TEXT NOT NULL,
  sched_s INTEGER NOT NULL, -- seconds after the service day's start (can exceed 24 h)
  PRIMARY KEY (trip_id, stop_sequence)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS stop_times_by_stop ON stop_times (stop_id, sched_s);
CREATE TABLE IF NOT EXISTS calendar (
  service_id TEXT PRIMARY KEY,
  days TEXT NOT NULL, -- 7 characters, Monday first, '1' when service runs
  start_date TEXT NOT NULL, end_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_dates (
  service_id TEXT NOT NULL, date TEXT NOT NULL, exception_type INTEGER NOT NULL,
  PRIMARY KEY (service_id, date)
);

-- Observed history (kept across schedule imports, so it copies what it needs from the schedule)
CREATE TABLE IF NOT EXISTS arrivals (
  service_date TEXT NOT NULL,     -- YYYYMMDD
  trip_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  stop_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  headsign TEXT NOT NULL,
  weekday INTEGER NOT NULL,       -- 0 = Monday ... 6 = Sunday
  sched_s INTEGER NOT NULL,       -- scheduled time, seconds after the service day's start
  scheduled_at INTEGER NOT NULL,  -- unix seconds
  observed_at INTEGER NOT NULL,   -- unix seconds the bus left (or passed) the stop
  delay_s INTEGER NOT NULL,
  method TEXT NOT NULL,           -- passed | stopped_at | trip_end
  PRIMARY KEY (service_date, trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS arrivals_by_stop ON arrivals (stop_id, weekday, sched_s);
CREATE INDEX IF NOT EXISTS arrivals_by_route ON arrivals (route_id, service_date);
`;

export function openDb(file = config.dbPath): DB {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A deploy ships its history as a gzipped snapshot (npm run snapshot); unpack it on first start.
    if (!fs.existsSync(file) && fs.existsSync(`${file}.gz`)) fs.writeFileSync(file, zlib.gunzipSync(fs.readFileSync(`${file}.gz`)));
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL"); // the collector writes while the web server reads
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

export function getMeta(db: DB, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

// Replays five real snapshots recorded from BT's feed (30 s apart, Oct 20 2026) through the collector.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Collector } from "../src/collector/collector.ts";
import { MAX_ABS_DELAY_S } from "../src/collector/infer.ts";
import { openDb, type DB } from "../src/db.ts";
import { parseFeeds, type Snapshot } from "../src/realtime/feed.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadSnapshots(): Snapshot[] {
  const dir = path.join(fixtures, "snapshots");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("trip_updates.pb"))
    .sort()
    .map((f) => parseFeeds(fs.readFileSync(path.join(dir, f)), fs.readFileSync(path.join(dir, f.replace("trip_updates", "vehicle_positions")))));
}

function scheduleDb(): DB {
  const db = openDb(":memory:");
  const rows = JSON.parse(fs.readFileSync(path.join(fixtures, "schedule.json"), "utf8")) as Record<string, Record<string, unknown>[]>;
  for (const [table, list] of Object.entries(rows)) {
    for (const row of list) {
      const cols = Object.keys(row);
      db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => `@${c}`).join(",")})`).run(row);
    }
  }
  return db;
}

describe("replaying recorded BT snapshots", () => {
  const snapshots = loadSnapshots();
  const db = scheduleDb();
  const collector = new Collector(db, () => Promise.reject(new Error("not used")));
  const results = snapshots.map((s) => collector.ingest(s));
  const arrivals = db.prepare("SELECT * FROM arrivals").all() as {
    trip_id: string;
    stop_sequence: number;
    observed_at: number;
    delay_s: number;
    method: string;
  }[];

  it("parses every snapshot and sees the running buses", () => {
    expect(snapshots).toHaveLength(5);
    for (const s of snapshots) expect(s.trips.size).toBeGreaterThan(10);
    expect(results.map((r) => r.feedTs)).toEqual([...results.map((r) => r.feedTs)].sort());
  });

  it("detects departures, each inside the window of the snapshots that saw it", () => {
    expect(arrivals.length).toBeGreaterThan(5);
    const first = snapshots[0]!.feedTs;
    const last = snapshots.at(-1)!.feedTs;
    for (const a of arrivals) {
      expect(a.observed_at).toBeGreaterThanOrEqual(first);
      expect(a.observed_at).toBeLessThanOrEqual(last);
      expect(Math.abs(a.delay_s)).toBeLessThanOrEqual(MAX_ABS_DELAY_S);
    }
  });

  it("never records a stop twice for the same trip", () => {
    const keys = arrivals.map((a) => `${a.trip_id}#${a.stop_sequence}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is idempotent when the same snapshot arrives twice", () => {
    expect(collector.ingest(snapshots.at(-1)!)).toMatchObject({ arrivals: 0, skipped: "feed not updated" });
  });
});

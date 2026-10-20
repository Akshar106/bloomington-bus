import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/db.ts";
import { parseFeeds, type Snapshot } from "../src/realtime/feed.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** Five real BT snapshots recorded 30 s apart on Tue Oct 20 2026, around 2:41 PM. */
export function loadSnapshots(): Snapshot[] {
  const dir = path.join(fixtures, "snapshots");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("trip_updates.pb"))
    .sort()
    .map((f) => parseFeeds(fs.readFileSync(path.join(dir, f)), fs.readFileSync(path.join(dir, f.replace("trip_updates", "vehicle_positions")))));
}

/** In-memory database holding the slice of BT's schedule the recorded snapshots need. */
export function scheduleDb(): DB {
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

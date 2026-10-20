// Writes test/fixtures/schedule.json: just the schedule rows the recorded snapshots need, so the
// replay test runs without downloading BT's full schedule.   node scripts/export-fixture-schedule.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.ts";
import { parseFeeds } from "../src/realtime/feed.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const dir = path.join(fixtures, "snapshots");
const tripIds = new Set<string>();
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith("trip_updates.pb"))) {
  for (const id of parseFeeds(fs.readFileSync(path.join(dir, f)), null).trips.keys()) tripIds.add(id);
}

const db = openDb();
const ids = [...tripIds];
const marks = ids.map(() => "?").join(",");
const trips = db.prepare(`SELECT * FROM trips WHERE trip_id IN (${marks})`).all(...ids) as { service_id: string; route_id: string }[];
const services = [...new Set(trips.map((t) => t.service_id))];
const serviceMarks = services.map(() => "?").join(",");
const routeIds = [...new Set(trips.map((t) => t.route_id))];
const stopTimes = db.prepare(`SELECT * FROM stop_times WHERE trip_id IN (${marks})`).all(...ids) as { stop_id: string }[];
const stopIds = [...new Set(stopTimes.map((s) => s.stop_id))];
const out = {
  routes: db.prepare(`SELECT * FROM routes WHERE route_id IN (${routeIds.map(() => "?").join(",")})`).all(...routeIds),
  stops: db.prepare(`SELECT * FROM stops WHERE stop_id IN (${stopIds.map(() => "?").join(",")})`).all(...stopIds),
  trips,
  stop_times: stopTimes,
  calendar: db.prepare(`SELECT * FROM calendar WHERE service_id IN (${serviceMarks})`).all(...services),
  calendar_dates: db.prepare(`SELECT * FROM calendar_dates WHERE service_id IN (${serviceMarks})`).all(...services),
};
fs.writeFileSync(path.join(fixtures, "schedule.json"), JSON.stringify(out));
console.log(`wrote ${trips.length} trips, ${out.stop_times.length} stop times`);

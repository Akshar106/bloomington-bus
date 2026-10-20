// Prints how a few trips evolve across recorded snapshots, to check what BT's feed means:
//   node scripts/inspect-snapshots.ts [tripCount=5]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.ts";
import { parseFeeds } from "../src/realtime/feed.ts";
import { Schedule } from "../src/schedule/service.ts";
import { localDate, serviceDayStart } from "../src/time.ts";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "snapshots");
const tripCount = Number(process.argv[2] ?? 5);
const schedule = new Schedule(openDb());
const clock = (s: number) => new Date(s * 1000).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
const { transit_realtime: rt } = GtfsRealtimeBindings;

const lines = new Map<string, string[]>();
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith("trip_updates.pb")).sort()) {
  const tu = fs.readFileSync(path.join(dir, f));
  const vpFile = path.join(dir, f.replace("trip_updates", "vehicle_positions"));
  const vp = fs.existsSync(vpFile) ? fs.readFileSync(vpFile) : null;
  const snap = parseFeeds(tu, vp);
  const vehicles = new Map(
    vp ? rt.FeedMessage.decode(vp).entity.map((e) => [e.vehicle?.trip?.tripId ?? "", e.vehicle]) : [],
  );
  for (const t of snap.trips.values()) {
    const trip = schedule.trip(t.tripId);
    const date = trip && schedule.serviceDate(trip, snap.feedTs, localDate(snap.feedTs));
    if (!trip || !date) continue;
    const upcoming = [...t.upcoming].slice(0, 3).map(([seq, delay]) => {
      const stop = trip.stops.get(seq)!;
      return `#${seq} sched ${clock(serviceDayStart(date) + stop.schedS)} delay ${delay}s`;
    });
    const v = vehicles.get(t.tripId);
    const status = v ? `${["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"][v.currentStatus ?? 2]} ${v.stopId}` : "no vehicle";
    const at = v?.stopId ? [...trip.stops].find(([, s]) => s.stopId === v.stopId)?.[0] : undefined;
    const row = `  feed ${clock(snap.feedTs)} | ${upcoming.join(", ")} | vehicle ${status} (#${at ?? "?"})`;
    if (!lines.has(t.tripId)) lines.set(t.tripId, []);
    lines.get(t.tripId)!.push(row);
  }
}
for (const [tripId, rows] of [...lines].slice(0, tripCount)) console.log(`${tripId}\n${rows.join("\n")}`);

// Polls the live feed, detects departures and stores them. Runs on its own (npm run collect) or
// inside the web server when COLLECT=true.
import { config } from "../config.ts";
import { getMeta, setMeta, type DB } from "../db.ts";
import { fetchSnapshot, type Snapshot } from "../realtime/feed.ts";
import { refreshSchedule } from "../schedule/importer.ts";
import { Schedule } from "../schedule/service.ts";
import { localDate } from "../time.ts";
import { inferArrivals, type Arrival } from "./infer.ts";

const SCHEDULE_CHECK_S = 6 * 3600;
const STOPPED_TTL_S = 2 * 3600;

export type TickResult = { feedTs: number; trips: number; arrivals: number; skipped?: string };

export class Collector {
  private prev: Snapshot | null = null;
  private stoppedAt = new Map<string, number>(); // "trip|stop" -> latest time seen stopped there
  private schedule: Schedule;
  private insert: (rows: Arrival[]) => number;
  private db: DB;
  private fetch: () => Promise<Snapshot>;

  constructor(db: DB, fetch: () => Promise<Snapshot> = fetchSnapshot) {
    this.db = db;
    this.fetch = fetch;
    this.schedule = new Schedule(db);
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO arrivals VALUES
       (@serviceDate, @tripId, @stopSequence, @stopId, @routeId, @headsign, @weekday, @schedS,
        @scheduledAt, @observedAt, @delayS, @method)`,
    );
    this.insert = db.transaction((rows: Arrival[]) => {
      let added = 0;
      for (const row of rows) added += stmt.run(row).changes;
      return added;
    });
  }

  /** Processes one snapshot. Exposed separately from tick() so tests can replay recorded feeds. */
  ingest(cur: Snapshot): TickResult {
    if (this.prev && cur.feedTs <= this.prev.feedTs) {
      return { feedTs: cur.feedTs, trips: cur.trips.size, arrivals: 0, skipped: "feed not updated" };
    }
    for (const t of cur.trips.values()) {
      if (!t.vehicle?.stopped) continue;
      const key = `${t.tripId}|${t.vehicle.stopId}`;
      this.stoppedAt.set(key, Math.max(this.stoppedAt.get(key) ?? 0, t.vehicle.at));
    }
    for (const [key, at] of this.stoppedAt) if (at < cur.feedTs - STOPPED_TTL_S) this.stoppedAt.delete(key);

    let added = 0;
    if (this.prev) {
      const today = localDate(cur.feedTs);
      const arrivals = inferArrivals(this.prev, cur, {
        lookup: (tripId) => {
          const trip = this.schedule.trip(tripId);
          const serviceDate = trip && this.schedule.serviceDate(trip, cur.feedTs, today);
          return trip && serviceDate ? { trip, serviceDate } : null;
        },
        lastStoppedAt: (tripId, stopId) => this.stoppedAt.get(`${tripId}|${stopId}`),
      });
      added = this.insert(arrivals);
    }
    this.prev = cur;
    return { feedTs: cur.feedTs, trips: cur.trips.size, arrivals: added };
  }

  async tick(): Promise<TickResult> {
    const now = Math.floor(Date.now() / 1000);
    try {
      const result = this.ingest(await this.fetch());
      if (!getMeta(this.db, "collecting_since")) setMeta(this.db, "collecting_since", String(now));
      setMeta(this.db, "last_tick_at", String(now));
      setMeta(this.db, "last_feed_ts", String(result.feedTs));
      setMeta(this.db, "last_error", "");
      return result;
    } catch (err) {
      setMeta(this.db, "last_error", `${new Date(now * 1000).toISOString()} ${String(err)}`);
      throw err;
    }
  }

  async refreshScheduleIfStale(): Promise<void> {
    const imported = Number(getMeta(this.db, "schedule_imported_at") ?? 0);
    const checked = Number(getMeta(this.db, "schedule_checked_at") ?? 0);
    const now = Math.floor(Date.now() / 1000);
    if (imported && now - checked < SCHEDULE_CHECK_S) return;
    setMeta(this.db, "schedule_checked_at", String(now));
    if (await refreshSchedule(this.db)) {
      this.schedule.clear();
      console.log("Imported a new schedule from Bloomington Transit.");
    }
  }
}

/** Runs forever: one tick every config.pollSeconds, never overlapping. */
export function startCollector(db: DB, log = console.log): () => void {
  const collector = new Collector(db);
  let running = false;
  let ticks = 0;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await collector.refreshScheduleIfStale();
      const r = await collector.tick();
      ticks += 1;
      if (r.arrivals > 0 || ticks % 20 === 1) {
        log(`${new Date().toISOString()} trips=${r.trips} new_departures=${r.arrivals}${r.skipped ? ` (${r.skipped})` : ""}`);
      }
    } catch (err) {
      log(`${new Date().toISOString()} collector error: ${String(err)}`);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, config.pollSeconds * 1000);
  return () => clearInterval(timer);
}

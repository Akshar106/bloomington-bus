// Read-side queries behind the API. Schedule-derived lookups are cached and rebuilt whenever a new
// schedule is imported.
import { frontier, MAX_ABS_DELAY_S, tripDelay } from "../collector/infer.ts";
import { getMeta, type DB } from "../db.ts";
import type { Snapshot } from "../realtime/feed.ts";
import { Schedule } from "../schedule/service.ts";
import { localDate, serviceDayStart, weekdayOf } from "../time.ts";
import { DAY_TYPES, dayTypeOf, HISTORY_DAYS, summarize, summarizeBy, type DayType, type Summary } from "./stats.ts";

export type Route = { id: string; shortName: string; longName: string; color: string; textColor: string };
export type Stop = { id: string; name: string; lat: number; lon: number; routes: string[] };

type Catalog = {
  version: string;
  schedule: Schedule;
  routes: Route[];
  routeById: Map<string, Route>;
  stops: Stop[];
  stopById: Map<string, Stop>;
  destination: Map<string, string>; // trip_id -> name of its last stop
};

const catalogs = new WeakMap<DB, Catalog>();

function getCatalog(db: DB): Catalog {
  const version = getMeta(db, "schedule_imported_at") ?? "";
  const cached = catalogs.get(db);
  if (cached?.version === version) return cached;

  const routes = (
    db.prepare("SELECT route_id, short_name, long_name, color, text_color FROM routes ORDER BY sort_order").all() as {
      route_id: string;
      short_name: string;
      long_name: string;
      color: string;
      text_color: string;
    }[]
  ).map((r) => ({ id: r.route_id, shortName: r.short_name, longName: r.long_name, color: r.color, textColor: r.text_color }));
  const order = new Map(routes.map((r, i) => [r.id, i]));

  const stopRows = db
    .prepare(
      `SELECT s.stop_id, s.name, s.lat, s.lon, group_concat(DISTINCT t.route_id) AS routes
       FROM stops s JOIN stop_times st ON st.stop_id = s.stop_id JOIN trips t ON t.trip_id = st.trip_id
       GROUP BY s.stop_id ORDER BY s.name`,
    )
    .all() as { stop_id: string; name: string; lat: number; lon: number; routes: string }[];
  const stops = stopRows.map((s) => ({
    id: s.stop_id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    routes: s.routes.split(",").sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)),
  }));

  const destination = new Map(
    (
      db
        .prepare(
          `SELECT st.trip_id, s.name FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
           WHERE st.stop_sequence = (SELECT MAX(stop_sequence) FROM stop_times x WHERE x.trip_id = st.trip_id)`,
        )
        .all() as { trip_id: string; name: string }[]
    ).map((r) => [r.trip_id, r.name]),
  );

  const catalog: Catalog = {
    version,
    schedule: new Schedule(db),
    routes,
    routeById: new Map(routes.map((r) => [r.id, r])),
    stops,
    stopById: new Map(stops.map((s) => [s.id, s])),
    destination,
  };
  catalogs.set(db, catalog);
  return catalog;
}

export const listRoutes = (db: DB) => getCatalog(db).routes;
export const listStops = (db: DB) => getCatalog(db).stops;
export const getStop = (db: DB, id: string) => getCatalog(db).stopById.get(id);
export const getRoute = (db: DB, id: string) => getCatalog(db).routeById.get(id);

const sinceS = (nowS: number) => nowS - HISTORY_DAYS * 86400;
const tripKey = (routeId: string, headsign: string, schedS: number) => `${routeId}|${headsign}|${schedS}`;
// Nobody boards at a trip's last stop, so departure lists leave it out.
const NOT_LAST_STOP = "st.stop_sequence < (SELECT MAX(stop_sequence) FROM stop_times x WHERE x.trip_id = st.trip_id)";

/** Track record of each scheduled bus at a stop (same route, direction and time) on one kind of day. */
function historyAtStop(db: DB, stopId: string, dayType: DayType, nowS: number): Map<string, Summary> {
  const days = DAY_TYPES[dayType];
  const rows = db
    .prepare(
      `SELECT route_id, headsign, sched_s, delay_s FROM arrivals
       WHERE stop_id = ? AND observed_at >= ? AND weekday IN (${days.join(",")})`,
    )
    .all(stopId, sinceS(nowS)) as { route_id: string; headsign: string; sched_s: number; delay_s: number }[];
  return summarizeBy(rows, (r) => tripKey(r.route_id, r.headsign, r.sched_s));
}

export type Departure = {
  tripId: string;
  routeId: string;
  destination: string;
  scheduledAt: number;
  expectedAt: number;
  delayS: number | null; // null when there's no live data for this bus
  usual: Summary | null;
};

/** Next buses at a stop: today's timetable, adjusted by the live feed when the bus is tracked. */
export function departures(db: DB, stopId: string, nowS: number, snapshot: Snapshot | null): Departure[] {
  const cat = getCatalog(db);
  const today = localDate(nowS);
  const dayStart = serviceDayStart(today);
  const rows = db
    .prepare(
      `SELECT st.trip_id, st.stop_sequence, st.sched_s, t.route_id, t.service_id, t.headsign
       FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
       WHERE st.stop_id = ? AND st.sched_s BETWEEN ? AND ? AND ${NOT_LAST_STOP}`,
    )
    .all(stopId, nowS - dayStart - 3600, nowS - dayStart + 3 * 3600) as {
    trip_id: string;
    stop_sequence: number;
    sched_s: number;
    route_id: string;
    service_id: string;
    headsign: string;
  }[];
  const usual = historyAtStop(db, stopId, dayTypeOf(weekdayOf(today)), nowS);

  const out: Departure[] = [];
  for (const r of rows) {
    if (!cat.schedule.runsOn(r.service_id, today)) continue;
    const scheduledAt = dayStart + r.sched_s;
    let delayS: number | null = null;
    const tracked = snapshot?.trips.get(r.trip_id);
    const trip = tracked && cat.schedule.trip(r.trip_id);
    if (tracked && trip) {
      const next = frontier(tracked, trip);
      if (next !== undefined && next > r.stop_sequence) continue; // this bus already left the stop
      const d = tripDelay(tracked);
      if (d !== undefined && Math.abs(d) <= MAX_ABS_DELAY_S) delayS = d;
    }
    const expectedAt = scheduledAt + (delayS ?? 0);
    if (delayS === null && scheduledAt < nowS - 120) continue; // untracked and its time has passed
    if (expectedAt < nowS - 60 || expectedAt > nowS + 2 * 3600) continue;
    out.push({
      tripId: r.trip_id,
      routeId: r.route_id,
      destination: cat.destination.get(r.trip_id) ?? r.headsign,
      scheduledAt,
      expectedAt,
      delayS,
      usual: usual.get(tripKey(r.route_id, r.headsign, r.sched_s)) ?? null,
    });
  }
  return out.sort((a, b) => a.expectedAt - b.expectedAt).slice(0, 12);
}

export type TimetableRow = { routeId: string; destination: string; schedS: number; stats: Summary | null };

/** Every scheduled departure at a stop on one kind of day, each with its track record. */
export function timetable(db: DB, stopId: string, dayType: DayType, nowS: number): TimetableRow[] {
  const cat = getCatalog(db);
  const days = DAY_TYPES[dayType];
  const rows = db
    .prepare(
      `SELECT st.trip_id, st.sched_s, t.route_id, t.headsign, c.days
       FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id JOIN calendar c ON c.service_id = t.service_id
       WHERE st.stop_id = ? AND ${NOT_LAST_STOP} ORDER BY st.sched_s`,
    )
    .all(stopId) as { trip_id: string; sched_s: number; route_id: string; headsign: string; days: string }[];
  const history = historyAtStop(db, stopId, dayType, nowS);

  const seen = new Set<string>();
  const out: TimetableRow[] = [];
  for (const r of rows) {
    if (!days.some((d) => r.days[d] === "1")) continue;
    const key = tripKey(r.route_id, r.headsign, r.sched_s);
    if (seen.has(key)) continue; // e.g. the Mon–Thu and Friday versions of the same bus
    seen.add(key);
    out.push({
      routeId: r.route_id,
      destination: cat.destination.get(r.trip_id) ?? r.headsign,
      schedS: r.sched_s,
      stats: history.get(key) ?? null,
    });
  }
  return out;
}

export type RouteDirection = {
  destination: string;
  stats: Summary | null;
  stops: { id: string; name: string; stats: Summary | null }[];
};

/** A route's overall record plus, per direction, its stops in order with each stop's record. */
export function routeDetail(db: DB, routeId: string, nowS: number) {
  const cat = getCatalog(db);
  const history = db
    .prepare("SELECT headsign, stop_id, delay_s FROM arrivals WHERE route_id = ? AND observed_at >= ?")
    .all(routeId, sinceS(nowS)) as { headsign: string; stop_id: string; delay_s: number }[];
  const byDirection = summarizeBy(history, (r) => r.headsign);
  const byStop = summarizeBy(history, (r) => `${r.headsign}|${r.stop_id}`);

  // One representative trip per direction: the one serving the most stops.
  const reps = db
    .prepare(
      `SELECT t.headsign, t.trip_id, COUNT(*) AS n FROM trips t JOIN stop_times st ON st.trip_id = t.trip_id
       WHERE t.route_id = ? GROUP BY t.trip_id ORDER BY n DESC`,
    )
    .all(routeId) as { headsign: string; trip_id: string }[];
  const directions: RouteDirection[] = [];
  const done = new Set<string>();
  for (const rep of reps) {
    if (done.has(rep.headsign)) continue;
    done.add(rep.headsign);
    const stops = db
      .prepare("SELECT stop_id FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence")
      .all(rep.trip_id) as { stop_id: string }[];
    directions.push({
      destination: cat.destination.get(rep.trip_id) ?? rep.headsign,
      stats: byDirection.get(rep.headsign) ?? null,
      stops: stops.map((s) => ({
        id: s.stop_id,
        name: cat.stopById.get(s.stop_id)?.name ?? s.stop_id,
        stats: byStop.get(`${rep.headsign}|${s.stop_id}`) ?? null,
      })),
    });
  }
  return { route: cat.routeById.get(routeId)!, stats: summarize(history.map((h) => h.delay_s)), directions };
}

export function status(db: DB, nowS: number) {
  const num = (key: string) => {
    const v = getMeta(db, key);
    return v ? Number(v) : null;
  };
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT service_date) AS days,
              SUM(observed_at >= ?) AS last24h, MIN(service_date) AS first_day
       FROM arrivals`,
    )
    .get(nowS - 86400) as { total: number; days: number; last24h: number | null; first_day: string | null };
  const lastFeed = num("last_feed_ts");
  return {
    collectingSince: num("collecting_since"),
    lastCollectedAt: num("last_tick_at"),
    feedAgeS: lastFeed ? nowS - lastFeed : null,
    lastError: getMeta(db, "last_error") || null,
    departuresRecorded: counts.total,
    departuresLast24h: counts.last24h ?? 0,
    daysWithData: counts.days,
    firstDay: counts.first_day,
    scheduleImportedAt: num("schedule_imported_at"),
    historyDays: HISTORY_DAYS,
  };
}

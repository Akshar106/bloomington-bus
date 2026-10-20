// Answers "which day's service is this trip running on?" from the schedule's calendar tables.
import type { DB } from "../db.ts";
import { addDays, serviceDayStart, weekdayOf } from "../time.ts";

export type TripInfo = {
  tripId: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  stops: Map<number, { stopId: string; schedS: number }>; // by stop_sequence
  firstS: number;
  lastS: number;
  lastSequence: number;
};

export class Schedule {
  private trips = new Map<string, TripInfo | null>();
  private active = new Map<string, boolean>();
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  /** Call after a schedule import so cached trips aren't stale. */
  clear(): void {
    this.trips.clear();
    this.active.clear();
  }

  trip(tripId: string): TripInfo | null {
    if (this.trips.has(tripId)) return this.trips.get(tripId) ?? null;
    const t = this.db
      .prepare("SELECT route_id, service_id, headsign FROM trips WHERE trip_id = ?")
      .get(tripId) as { route_id: string; service_id: string; headsign: string } | undefined;
    let info: TripInfo | null = null;
    if (t) {
      const rows = this.db
        .prepare("SELECT stop_sequence, stop_id, sched_s FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence")
        .all(tripId) as { stop_sequence: number; stop_id: string; sched_s: number }[];
      if (rows.length > 0) {
        info = {
          tripId,
          routeId: t.route_id,
          serviceId: t.service_id,
          headsign: t.headsign,
          stops: new Map(rows.map((r) => [r.stop_sequence, { stopId: r.stop_id, schedS: r.sched_s }])),
          firstS: rows[0]!.sched_s,
          lastS: rows.at(-1)!.sched_s,
          lastSequence: rows.at(-1)!.stop_sequence,
        };
      }
    }
    this.trips.set(tripId, info);
    return info;
  }

  /** Whether a service_id runs on a YYYYMMDD date (calendar plus calendar_dates exceptions). */
  runsOn(serviceId: string, date: string): boolean {
    const key = `${serviceId}|${date}`;
    const cached = this.active.get(key);
    if (cached !== undefined) return cached;
    const exception = this.db
      .prepare("SELECT exception_type FROM calendar_dates WHERE service_id = ? AND date = ?")
      .get(serviceId, date) as { exception_type: number } | undefined;
    let runs: boolean;
    if (exception) {
      runs = exception.exception_type === 1;
    } else {
      const cal = this.db
        .prepare("SELECT days, start_date, end_date FROM calendar WHERE service_id = ?")
        .get(serviceId) as { days: string; start_date: string; end_date: string } | undefined;
      runs = !!cal && cal.start_date <= date && date <= cal.end_date && cal.days[weekdayOf(date)] === "1";
    }
    this.active.set(key, runs);
    return runs;
  }

  /**
   * The realtime feed doesn't say which day a trip belongs to, so pick the service day (today or
   * yesterday, for trips running past midnight) whose timetable puts the trip closest to now.
   */
  serviceDate(trip: TripInfo, nowS: number, today: string): string | null {
    let best: { date: string; distance: number } | null = null;
    for (const date of [today, addDays(today, -1)]) {
      if (!this.runsOn(trip.serviceId, date)) continue;
      const start = serviceDayStart(date);
      const from = start + trip.firstS - 3600;
      const to = start + trip.lastS + 3600;
      const distance = nowS < from ? from - nowS : nowS > to ? nowS - to : 0;
      if (!best || distance < best.distance) best = { date, distance };
    }
    return best && best.distance < 3 * 3600 ? best.date : null;
  }
}

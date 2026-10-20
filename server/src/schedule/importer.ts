import { unzipSync, strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";
import { config } from "../config.ts";
import { getMeta, setMeta, type DB } from "../db.ts";
import { parseGtfsTime } from "../time.ts";

type Row = Record<string, string>;

function readCsv(files: Record<string, Uint8Array>, name: string, required = true): Row[] {
  const file = files[name];
  if (!file) {
    if (required) throw new Error(`schedule is missing ${name}`);
    return [];
  }
  return parse(strFromU8(file), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Row[];
}

export type ImportResult = { routes: number; stops: number; trips: number; stopTimes: number };

/** Replaces the schedule tables with the contents of a GTFS zip. Arrival history is untouched. */
export function importSchedule(db: DB, zip: Uint8Array): ImportResult {
  const files = unzipSync(zip);
  const routes = readCsv(files, "routes.txt");
  const stops = readCsv(files, "stops.txt");
  const trips = readCsv(files, "trips.txt");
  const stopTimes = readCsv(files, "stop_times.txt");
  const calendar = readCsv(files, "calendar.txt", false);
  const calendarDates = readCsv(files, "calendar_dates.txt", false);

  const replace = db.transaction(() => {
    for (const t of ["routes", "stops", "trips", "stop_times", "calendar", "calendar_dates"]) db.exec(`DELETE FROM ${t}`);

    const insRoute = db.prepare("INSERT INTO routes VALUES (?, ?, ?, ?, ?, ?)");
    routes.forEach((r, i) =>
      insRoute.run(
        r.route_id,
        r.route_short_name ?? "",
        r.route_long_name ?? "",
        `#${r.route_color || "1d4ed8"}`,
        `#${r.route_text_color || "ffffff"}`,
        Number(r.route_sort_order || i),
      ),
    );

    const insStop = db.prepare("INSERT INTO stops VALUES (?, ?, ?, ?)");
    // location_type 1 is a parent station; buses stop at the platforms/poles (0 or empty).
    for (const s of stops) {
      if (s.location_type && s.location_type !== "0") continue;
      insStop.run(s.stop_id, s.stop_name ?? s.stop_id, Number(s.stop_lat), Number(s.stop_lon));
    }

    const insTrip = db.prepare("INSERT INTO trips VALUES (?, ?, ?, ?, ?)");
    for (const t of trips) {
      insTrip.run(t.trip_id, t.route_id, t.service_id, t.trip_headsign ?? "", t.direction_id ? Number(t.direction_id) : null);
    }

    const insStopTime = db.prepare("INSERT INTO stop_times VALUES (?, ?, ?, ?)");
    for (const st of stopTimes) {
      const time = st.departure_time || st.arrival_time;
      if (!time) continue; // untimed stops are interpolated in GTFS; this feed times every stop
      insStopTime.run(st.trip_id, Number(st.stop_sequence), st.stop_id, parseGtfsTime(time));
    }

    const insCal = db.prepare("INSERT INTO calendar VALUES (?, ?, ?, ?)");
    const dayCols = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    for (const c of calendar) insCal.run(c.service_id, dayCols.map((d) => (c[d] === "1" ? "1" : "0")).join(""), c.start_date, c.end_date);

    const insCalDate = db.prepare("INSERT INTO calendar_dates VALUES (?, ?, ?)");
    for (const c of calendarDates) insCalDate.run(c.service_id, c.date, Number(c.exception_type));
  });
  replace();

  return { routes: routes.length, stops: stops.length, trips: trips.length, stopTimes: stopTimes.length };
}

/**
 * Downloads the schedule and imports it if BT published a new version (judged by the file's
 * Last-Modified/ETag). Returns null when the stored schedule is already current.
 */
export async function refreshSchedule(db: DB, force = false): Promise<ImportResult | null> {
  const head = await fetch(config.scheduleUrl, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
  const version = head.headers.get("etag") ?? head.headers.get("last-modified") ?? "";
  if (!force && version && getMeta(db, "schedule_version") === version) return null;

  const res = await fetch(config.scheduleUrl, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`schedule download failed: HTTP ${res.status}`);
  const result = importSchedule(db, new Uint8Array(await res.arrayBuffer()));
  setMeta(db, "schedule_version", version);
  setMeta(db, "schedule_imported_at", String(Math.floor(Date.now() / 1000)));
  return result;
}

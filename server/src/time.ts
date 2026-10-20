// Time helpers for GTFS. Schedule times like "25:10:00" are measured from the start of the
// "service day", defined as noon minus 12 hours in the agency's time zone (which keeps them
// correct on daylight-saving days).
import { config } from "./config.ts";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: config.timezone,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localParts(epochS: number) {
  const p = Object.fromEntries(parts.formatToParts(new Date(epochS * 1000)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday ?? ""),
  };
}

/** Seconds to add to UTC to get local wall-clock time at this instant. */
function utcOffsetS(epochS: number): number {
  const p = localParts(epochS);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - epochS;
}

/** "20261020" -> unix seconds at the start of that GTFS service day. */
export function serviceDayStart(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  const noonUtc = Date.UTC(y, m - 1, d, 12) / 1000;
  // Noon is never inside a DST switch (they happen at 2 AM), so one offset lookup is exact.
  return noonUtc - utcOffsetS(noonUtc) - 12 * 3600;
}

/** Local calendar date as YYYYMMDD. */
export function localDate(epochS: number): string {
  const p = localParts(epochS);
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

/** 0 = Monday ... 6 = Sunday, for a YYYYMMDD date. */
export function weekdayOf(date: string): number {
  return localParts(serviceDayStart(date) + 12 * 3600).weekday;
}

export function addDays(date: string, days: number): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + days);
  return new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
}

/** "07:05:30" or "25:10:00" -> seconds. */
export function parseGtfsTime(value: string): number {
  const [h, m, s] = value.trim().split(":").map(Number);
  if (h === undefined || m === undefined || s === undefined || [h, m, s].some(Number.isNaN)) {
    throw new Error(`bad GTFS time: ${value}`);
  }
  return h * 3600 + m * 60 + s;
}

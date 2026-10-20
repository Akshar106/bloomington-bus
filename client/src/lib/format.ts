import type { Summary } from "../api.ts";

const clockFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/** Unix seconds -> "2:41 PM" in Bloomington time. */
export const clock = (epochS: number) => clockFormat.format(new Date(epochS * 1000));

/** Seconds after the start of the service day -> "2:41 PM". */
export function clockFromSchedule(schedS: number): string {
  const h = Math.floor(schedS / 3600) % 24;
  const m = Math.floor((schedS % 3600) / 60);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Now", "1 min", "12 min", "1h" or "1h 5m" until a time. */
export function minutesAway(epochS: number, nowS: number): string {
  const mins = Math.round((epochS - nowS) / 60);
  if (mins <= 0) return "Now";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
}

export type Tone = "ok" | "late" | "early" | "unknown";

/** On time means 1 minute early to 5 minutes late, the usual US transit definition. */
export function toneOf(delayS: number | null): Tone {
  if (delayS === null) return "unknown";
  if (delayS < -60) return "early";
  if (delayS > 300) return "late";
  return "ok";
}

/** Live status of one bus: "On time", "3 min late", "2 min early" or "Scheduled". */
export function delayLabel(delayS: number | null): string {
  if (delayS === null) return "Scheduled";
  const mins = Math.round(delayS / 60);
  if (mins === 0) return "On time";
  return mins > 0 ? `${mins} min late` : `${-mins} min early`;
}

/** Typical behavior of a bus from its history: "usually on time", "usually 4 min late". */
export function usually(summary: Summary): string {
  const label = delayLabel(summary.medianDelayS);
  return `usually ${label === "On time" ? "on time" : label}`;
}

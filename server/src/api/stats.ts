import { config } from "../config.ts";

/** How far back reliability stats look. */
export const HISTORY_DAYS = 28;
/** Fewer observations than this and we say "not enough data yet" instead of a number. */
export const MIN_SAMPLES = 3;

export type DayType = "weekday" | "saturday" | "sunday";
export const DAY_TYPES: Record<DayType, number[]> = { weekday: [0, 1, 2, 3, 4], saturday: [5], sunday: [6] };
export const dayTypeOf = (weekday: number): DayType => (weekday === 5 ? "saturday" : weekday === 6 ? "sunday" : "weekday");
export const isDayType = (v: unknown): v is DayType => v === "weekday" || v === "saturday" || v === "sunday";

export type Summary = {
  count: number;
  medianDelayS: number;
  onTimePct: number; // 1 min early to 5 min late
  earlyPct: number;
  latePct: number;
};

export function summarize(delays: number[]): Summary | null {
  if (delays.length < MIN_SAMPLES) return null;
  const sorted = [...delays].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const pct = (n: number) => Math.round((100 * n) / sorted.length);
  const early = sorted.filter((d) => d < config.onTimeEarlyS).length;
  const late = sorted.filter((d) => d > config.onTimeLateS).length;
  return {
    count: sorted.length,
    medianDelayS: Math.round(median),
    onTimePct: pct(sorted.length - early - late),
    earlyPct: pct(early),
    latePct: pct(late),
  };
}

/** Groups rows by a key and summarizes each group's delays. */
export function summarizeBy<T extends { delay_s: number }>(rows: T[], key: (row: T) => string): Map<string, Summary> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const k = key(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row.delay_s);
  }
  const out = new Map<string, Summary>();
  for (const [k, delays] of groups) {
    const s = summarize(delays);
    if (s) out.set(k, s);
  }
  return out;
}

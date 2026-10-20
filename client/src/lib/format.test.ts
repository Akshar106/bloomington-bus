import { describe, expect, it } from "vitest";
import { clock, clockFromSchedule, delayLabel, minutesAway, toneOf, usually } from "./format.ts";

describe("format", () => {
  it("shows times in Bloomington's time zone", () => {
    expect(clock(Date.UTC(2026, 9, 20, 18, 41) / 1000)).toBe("2:41 PM"); // 18:41 UTC = 2:41 PM EDT
    expect(clockFromSchedule(6 * 3600)).toBe("6:00 AM");
    expect(clockFromSchedule(12 * 3600 + 5 * 60)).toBe("12:05 PM");
    expect(clockFromSchedule(22 * 3600 + 57 * 60)).toBe("10:57 PM");
    expect(clockFromSchedule(24 * 3600 + 10 * 60)).toBe("12:10 AM"); // GTFS times can pass midnight
  });

  it("counts down to a bus", () => {
    expect(minutesAway(1000, 1000)).toBe("Now");
    expect(minutesAway(1000 + 20, 1000)).toBe("Now");
    expect(minutesAway(1000 + 60, 1000)).toBe("1 min");
    expect(minutesAway(1000 + 65 * 60, 1000)).toBe("1h 5m");
    expect(minutesAway(1000 + 120 * 60, 1000)).toBe("2h");
  });

  it("labels delays with the 1-minute-early to 5-minutes-late on-time window", () => {
    expect(delayLabel(null)).toBe("Scheduled");
    expect(delayLabel(20)).toBe("On time");
    expect(delayLabel(180)).toBe("3 min late");
    expect(delayLabel(-120)).toBe("2 min early");
    expect([toneOf(null), toneOf(-61), toneOf(-60), toneOf(300), toneOf(301)]).toEqual(["unknown", "early", "ok", "ok", "late"]);
  });

  it("describes a bus's usual behavior", () => {
    const base = { count: 5, onTimePct: 80, earlyPct: 0, latePct: 20 };
    expect(usually({ ...base, medianDelayS: 10 })).toBe("usually on time");
    expect(usually({ ...base, medianDelayS: 240 })).toBe("usually 4 min late");
  });
});

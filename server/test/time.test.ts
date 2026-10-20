import { describe, expect, it } from "vitest";
import { addDays, localDate, parseGtfsTime, serviceDayStart, weekdayOf } from "../src/time.ts";

const iso = (s: number) => new Date(s * 1000).toISOString();

describe("service day start (noon minus 12 h, America/New_York)", () => {
  it("is local midnight on a normal day", () => {
    expect(iso(serviceDayStart("20261020"))).toBe("2026-10-20T04:00:00.000Z"); // EDT
    expect(iso(serviceDayStart("20261215"))).toBe("2026-12-15T05:00:00.000Z"); // EST
  });

  it("follows the GTFS rule on the day clocks fall back", () => {
    // Nov 1 2026: noon is EST, so the service day starts at 05:00Z (1:00 AM EDT), not local midnight.
    expect(iso(serviceDayStart("20261101"))).toBe("2026-11-01T05:00:00.000Z");
  });

  it("follows the GTFS rule on the day clocks spring forward", () => {
    expect(iso(serviceDayStart("20270314"))).toBe("2027-03-14T04:00:00.000Z");
  });
});

describe("calendar helpers", () => {
  it("parses GTFS times past midnight", () => {
    expect(parseGtfsTime("07:05:30")).toBe(7 * 3600 + 5 * 60 + 30);
    expect(parseGtfsTime("25:10:00")).toBe(25 * 3600 + 600);
    expect(() => parseGtfsTime("7:xx")).toThrow();
  });

  it("knows weekdays, local dates and month ends", () => {
    expect(weekdayOf("20261019")).toBe(0); // Monday
    expect(weekdayOf("20261025")).toBe(6); // Sunday
    expect(localDate(Date.UTC(2026, 9, 21, 3, 30) / 1000)).toBe("20261020"); // 11:30 PM EDT
    expect(addDays("20261031", 1)).toBe("20261101");
    expect(addDays("20270101", -1)).toBe("20261231");
  });
});

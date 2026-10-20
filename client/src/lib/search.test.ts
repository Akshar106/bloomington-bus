import { describe, expect, it } from "vitest";
import type { Stop } from "../api.ts";
import { distanceM, formatDistance, nearestStops, searchStops } from "./search.ts";

const stop = (id: string, name: string, lat = 39.17, lon = -86.52): Stop => ({ id, name, lat, lon, routes: [] });
const stops = [
  stop("1", "10th St & Eagleson @ Wells Library", 39.17147, -86.5166),
  stop("2", "Eagleson Ave @ Wells Library", 39.17036, -86.51615),
  stop("3", "7th St and Woodlawn Ave at the Indiana Memorial Union", 39.16844, -86.52393),
  stop("4", "Adams St & Kirkwood Ave", 39.1665, -86.54945),
];

describe("searchStops", () => {
  it("matches every word, in any order, ignoring case and punctuation", () => {
    expect(searchStops(stops, "wells").map((s) => s.id)).toEqual(["1", "2"]); // alphabetical when neither starts with it
    expect(searchStops(stops, "library EAGLESON").map((s) => s.id).sort()).toEqual(["1", "2"]);
    expect(searchStops(stops, "kirkwood & adams").map((s) => s.id)).toEqual(["4"]);
    expect(searchStops(stops, "7th and woodlawn").map((s) => s.id)).toEqual(["3"]);
  });

  it("puts names that start with the query first", () => {
    expect(searchStops(stops, "eagleson").map((s) => s.id)).toEqual(["2", "1"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchStops(stops, "   ")).toEqual([]);
  });
});

describe("nearby stops", () => {
  it("measures distance and sorts nearest first", () => {
    // Wells Library to the IMU is roughly 650 m.
    expect(distanceM(39.17147, -86.5166, 39.16844, -86.52393)).toBeGreaterThan(600);
    expect(distanceM(39.17147, -86.5166, 39.16844, -86.52393)).toBeLessThan(720);
    expect(nearestStops(stops, 39.1705, -86.5162, 2).map((s) => s.id)).toEqual(["2", "1"]);
  });

  it("formats distances in feet, then miles", () => {
    expect(formatDistance(100)).toBe("330 ft");
    expect(formatDistance(1609.34 * 0.6)).toBe("0.6 mi");
  });
});

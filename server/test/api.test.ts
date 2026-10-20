import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { departures, routeDetail, timetable } from "../src/api/queries.ts";
import { createApp } from "../src/app.ts";
import { frontier } from "../src/collector/infer.ts";
import { Schedule } from "../src/schedule/service.ts";
import { serviceDayStart } from "../src/time.ts";
import { loadSnapshots, scheduleDb } from "./helpers.ts";

const db = scheduleDb();
const snapshot = loadSnapshots()[0]!;
const now = snapshot.feedTs; // Tue Oct 20 2026, ~2:41 PM

// A tracked bus and a stop it hasn't reached yet (two stops past where it is now).
const schedule = new Schedule(db);
const [tripId, tracked] = [...snapshot.trips].find(([id, t]) => {
  const trip = schedule.trip(id);
  if (!trip) return false;
  const next = frontier(t, trip);
  return next !== undefined && trip.stops.has(next + 2) && next + 2 < trip.lastSequence && Math.abs(t.upcoming.values().next().value!) < 3600;
})!;
const trip = schedule.trip(tripId)!;
const stopSeq = frontier(tracked, trip)! + 2;
const stop = trip.stops.get(stopSeq)!;

describe("departures", () => {
  it("shows the tracked bus with its live delay, soonest first", () => {
    const list = departures(db, stop.stopId, now, snapshot);
    const mine = list.find((d) => d.tripId === tripId);
    expect(mine).toBeDefined();
    expect(mine!.delayS).toBe(tracked.upcoming.values().next().value);
    expect(mine!.expectedAt).toBe(serviceDayStart("20261020") + stop.schedS + mine!.delayS!);
    expect(list.map((d) => d.expectedAt)).toEqual([...list.map((d) => d.expectedAt)].sort((a, b) => a - b));
    for (const d of list) expect(d.expectedAt).toBeGreaterThanOrEqual(now - 60);
  });

  it("falls back to the timetable when the live feed is unavailable", () => {
    for (const d of departures(db, stop.stopId, now, null)) {
      expect(d.delayS).toBeNull();
      expect(d.expectedAt).toBe(d.scheduledAt);
    }
  });
});

describe("track record", () => {
  // Three past Tuesdays where this bus left the stop 2, 4 and 9 minutes late.
  beforeAll(() => {
    const ins = db.prepare(
      `INSERT INTO arrivals VALUES (@date, @trip, @seq, @stop, @route, @headsign, 1, @sched, @at, @at, @delay, 'passed')`,
    );
    for (const [date, delay] of [["20261006", 120], ["20261013", 240], ["20260929", 540]] as const) {
      const at = serviceDayStart(date) + stop.schedS;
      ins.run({ date, trip: tripId, seq: stopSeq, stop: stop.stopId, route: trip.routeId, headsign: trip.headsign, sched: stop.schedS, at, delay });
    }
    // Days only change the arrival time; tweak observed_at so the delay matches.
    db.exec("UPDATE arrivals SET observed_at = scheduled_at + delay_s");
  });

  it("summarizes each scheduled bus on that kind of day", () => {
    const row = timetable(db, stop.stopId, "weekday", now).find((r) => r.routeId === trip.routeId && r.schedS === stop.schedS);
    expect(row?.stats).toEqual({ count: 3, medianDelayS: 240, onTimePct: 67, earlyPct: 0, latePct: 33 });
    expect(timetable(db, stop.stopId, "sunday", now).find((r) => r.schedS === stop.schedS && r.stats)).toBeUndefined();
  });

  it("adds it to the live departure for the same bus", () => {
    const mine = departures(db, stop.stopId, now, snapshot).find((d) => d.tripId === tripId);
    expect(mine?.usual?.medianDelayS).toBe(240);
  });

  it("rolls up per route and direction", () => {
    const detail = routeDetail(db, trip.routeId, now);
    expect(detail.route.id).toBe(trip.routeId);
    expect(detail.directions.length).toBeGreaterThan(0);
    expect(detail.directions.flatMap((d) => d.stops).find((s) => s.id === stop.stopId && s.stats)?.stats?.count).toBe(3);
  });
});

describe("HTTP API", () => {
  let base = "";
  let close = () => {};
  beforeAll(async () => {
    const server = createApp(db, "/nonexistent").listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    close = () => server.close();
  });
  afterAll(() => close());

  it("lists stops with the routes serving them", async () => {
    const stops = (await (await fetch(`${base}/stops`)).json()) as { id: string; routes: string[] }[];
    expect(stops.find((s) => s.id === stop.stopId)?.routes).toContain(trip.routeId);
  });

  it("rejects unknown stops, routes and day types", async () => {
    expect((await fetch(`${base}/stops/nope`)).status).toBe(404);
    expect((await fetch(`${base}/routes/nope`)).status).toBe(404);
    expect((await fetch(`${base}/stops/${stop.stopId}/timetable?day=funday`)).status).toBe(400);
    expect((await fetch(`${base}/nothing-here`)).status).toBe(404);
  });

  it("reports collection status", async () => {
    const status = (await (await fetch(`${base}/status`)).json()) as { departuresRecorded: number; historyDays: number };
    expect(status.departuresRecorded).toBe(3);
    expect(status.historyDays).toBe(28);
  });
});

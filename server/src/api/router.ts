import { Router } from "express";
import type { DB } from "../db.ts";
import { fetchSnapshot, type Snapshot } from "../realtime/feed.ts";
import { localDate, weekdayOf } from "../time.ts";
import { departures, getRoute, getStop, listRoutes, listStops, routeDetail, status, timetable } from "./queries.ts";
import { dayTypeOf, isDayType } from "./stats.ts";

const LIVE_CACHE_MS = 20_000; // BT updates its feed every ~30 s

let live: { at: number; snapshot: Promise<Snapshot | null> } | null = null;

/** The live feed, shared by all requests for 20 s. Null when BT's feed can't be reached. */
function liveSnapshot(): Promise<Snapshot | null> {
  if (!live || Date.now() - live.at > LIVE_CACHE_MS) {
    live = { at: Date.now(), snapshot: fetchSnapshot().catch(() => null) };
  }
  return live.snapshot;
}

const nowS = () => Math.floor(Date.now() / 1000);

export function apiRouter(db: DB): Router {
  const api = Router();

  api.get("/status", (_req, res) => {
    res.set("cache-control", "no-store").json(status(db, nowS()));
  });

  api.get("/routes", (_req, res) => {
    res.set("cache-control", "public, max-age=300").json(listRoutes(db));
  });

  api.get("/routes/:routeId", (req, res) => {
    if (!getRoute(db, req.params.routeId)) return void res.status(404).json({ error: "Unknown route" });
    res.set("cache-control", "public, max-age=60").json(routeDetail(db, req.params.routeId, nowS()));
  });

  api.get("/stops", (_req, res) => {
    res.set("cache-control", "public, max-age=300").json(listStops(db));
  });

  api.get("/stops/:stopId", (req, res) => {
    const stop = getStop(db, req.params.stopId);
    if (!stop) return void res.status(404).json({ error: "Unknown stop" });
    res.set("cache-control", "public, max-age=300").json(stop);
  });

  api.get("/stops/:stopId/departures", async (req, res) => {
    if (!getStop(db, req.params.stopId)) return void res.status(404).json({ error: "Unknown stop" });
    const snapshot = await liveSnapshot();
    res.set("cache-control", "no-store").json({
      live: snapshot !== null,
      generatedAt: nowS(),
      departures: departures(db, req.params.stopId, nowS(), snapshot),
    });
  });

  api.get("/stops/:stopId/timetable", (req, res) => {
    if (!getStop(db, req.params.stopId)) return void res.status(404).json({ error: "Unknown stop" });
    const day = req.query.day ?? dayTypeOf(weekdayOf(localDate(nowS())));
    if (!isDayType(day)) return void res.status(400).json({ error: "day must be weekday, saturday or sunday" });
    res.set("cache-control", "public, max-age=60").json({ day, rows: timetable(db, req.params.stopId, day, nowS()) });
  });

  api.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  return api;
}

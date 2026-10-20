// Turns two consecutive feed snapshots into observed departures. Pure: no I/O, no clock.
//
// Each snapshot tells us how far along its route every bus is: the first stop still listed in the
// trip update, or (about 30 s sooner) the stop the vehicle position says it is heading to or
// stopped at. Stops between the earlier and the later position were left during that window. We
// place each departure inside the window using the earlier snapshot's prediction (schedule + delay),
// and tighten the window when the bus was seen stopped there.
import type { Snapshot, TripSnapshot } from "../realtime/feed.ts";
import type { TripInfo } from "../schedule/service.ts";
import { serviceDayStart, weekdayOf } from "../time.ts";

export type Arrival = {
  serviceDate: string;
  tripId: string;
  stopSequence: number;
  stopId: string;
  routeId: string;
  headsign: string;
  weekday: number;
  schedS: number;
  scheduledAt: number;
  observedAt: number;
  delayS: number;
  method: "passed" | "stopped_at" | "trip_end";
};

export type InferContext = {
  /** The trip's schedule and the service day it is running on, or null if unknown. */
  lookup(tripId: string): { trip: TripInfo; serviceDate: string } | null;
  /** Latest time the vehicle on this trip was seen stopped at this stop, if any. */
  lastStoppedAt(tripId: string, stopId: string): number | undefined;
};

/** Longer gaps (e.g. the laptop slept) make the timing window too wide to trust. */
export const MAX_GAP_S = 180;
/** BT's feed sometimes keeps a bus on a long-finished trip with hours of "delay". */
export const MAX_ABS_DELAY_S = 3600;
/** A bus covers at most a few stops in 30 s; a bigger jump means a bad stop match. */
const MAX_VEHICLE_LEAD = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** First stop sequence the bus has not left yet, or undefined if the snapshot doesn't say. */
export function frontier(t: TripSnapshot, trip: TripInfo): number | undefined {
  const listed = t.upcoming.size > 0 ? Math.min(...t.upcoming.keys()) : undefined;
  if (!t.vehicle) return listed;
  const floor = listed ?? 0;
  // Smallest matching sequence at or after the listed one (routes can visit a stop twice).
  let atVehicle: number | undefined;
  for (const [seq, stop] of trip.stops) {
    if (seq >= floor && stop.stopId === t.vehicle.stopId && (atVehicle === undefined || seq < atVehicle)) atVehicle = seq;
  }
  if (atVehicle === undefined) return listed;
  if (listed === undefined) return atVehicle;
  return atVehicle - listed <= MAX_VEHICLE_LEAD ? Math.max(listed, atVehicle) : listed;
}

const tripDelay = (t: TripSnapshot): number | undefined => t.upcoming.values().next().value;

export function inferArrivals(prev: Snapshot, cur: Snapshot, ctx: InferContext): Arrival[] {
  const gap = cur.feedTs - prev.feedTs;
  if (gap <= 0 || gap > MAX_GAP_S) return [];

  const out: Arrival[] = [];
  for (const [tripId, before] of prev.trips) {
    const found = ctx.lookup(tripId);
    if (!found) continue;
    const { trip, serviceDate } = found;
    const fromSeq = frontier(before, trip);
    const delay = tripDelay(before);
    if (fromSeq === undefined || delay === undefined || Math.abs(delay) > MAX_ABS_DELAY_S) continue;
    const dayStart = serviceDayStart(serviceDate);
    const after = cur.trips.get(tripId);

    let passed: number[];
    let method: Arrival["method"] = "passed";
    const toSeq = after ? frontier(after, trip) : undefined;
    if (toSeq !== undefined) {
      passed = [...trip.stops.keys()].filter((seq) => seq >= fromSeq && seq < toSeq);
    } else {
      // The trip left the feed. Only its final stop is safe to count, and only if it was due:
      // anything else could be a cancellation or a feed glitch.
      const last = trip.lastSequence;
      const lastStop = trip.stops.get(last);
      const due = lastStop && before.upcoming.has(last) && dayStart + lastStop.schedS + delay <= cur.feedTs + 60;
      passed = due ? [last] : [];
      method = "trip_end";
    }

    for (const seq of passed) {
      const stop = trip.stops.get(seq)!;
      const scheduledAt = dayStart + stop.schedS;
      const predicted = scheduledAt + (before.upcoming.get(seq) ?? delay);
      const seen = ctx.lastStoppedAt(tripId, stop.stopId);
      const from = seen !== undefined && seen > prev.feedTs && seen <= cur.feedTs ? seen : prev.feedTs;
      const observedAt = clamp(predicted, from, cur.feedTs);
      out.push({
        serviceDate,
        tripId,
        stopSequence: seq,
        stopId: stop.stopId,
        routeId: trip.routeId,
        headsign: trip.headsign,
        weekday: weekdayOf(serviceDate),
        schedS: stop.schedS,
        scheduledAt,
        observedAt,
        delayS: observedAt - scheduledAt,
        method: from === prev.feedTs ? method : "stopped_at",
      });
    }
  }
  return out;
}

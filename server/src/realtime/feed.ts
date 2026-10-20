// Reads Bloomington Transit's GTFS-Realtime feeds into a small, plain snapshot.
//
// What BT's feed contains (checked against recorded snapshots, Oct 2026):
// - Trip updates list each running trip's *upcoming* stops as (stop_sequence, delay). The delay is
//   one trip-wide value in whole minutes, with no absolute times and no stop IDs, so everything is
//   joined to the static schedule by trip_id + stop_sequence.
// - Vehicle positions name the stop each bus is heading to or stopped at. They run about one update
//   (~30 s) ahead of the trip updates.
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { config } from "../config.ts";

const { transit_realtime: rt } = GtfsRealtimeBindings;

export type VehicleState = { stopId: string; stopped: boolean; at: number };

export type TripSnapshot = {
  tripId: string;
  upcoming: Map<number, number>; // stop_sequence -> delay in seconds
  vehicle?: VehicleState;
};

export type Snapshot = { feedTs: number; trips: Map<string, TripSnapshot> };

type LongLike = number | { toNumber(): number } | null | undefined;
const num = (v: LongLike): number => (v == null ? 0 : typeof v === "number" ? v : v.toNumber());

const { SKIPPED, NO_DATA } = rt.TripUpdate.StopTimeUpdate.ScheduleRelationship;
const { CANCELED } = rt.TripDescriptor.ScheduleRelationship;
const { STOPPED_AT } = rt.VehiclePosition.VehicleStopStatus;

export function parseFeeds(tripUpdates: Uint8Array, vehiclePositions: Uint8Array | null): Snapshot {
  const tu = rt.FeedMessage.decode(tripUpdates);
  const feedTs = num(tu.header.timestamp as LongLike);
  const trips = new Map<string, TripSnapshot>();
  for (const e of tu.entity) {
    const update = e.tripUpdate;
    const tripId = update?.trip?.tripId;
    if (!update || !tripId || update.trip.scheduleRelationship === CANCELED) continue;
    const upcoming = new Map<number, number>();
    for (const stu of update.stopTimeUpdate ?? []) {
      // Skipped stops and stops without a prediction can't be "served", so leave them out.
      if (stu.stopSequence == null || stu.scheduleRelationship === SKIPPED || stu.scheduleRelationship === NO_DATA) continue;
      const delay = stu.departure?.delay ?? stu.arrival?.delay;
      if (delay == null) continue;
      upcoming.set(stu.stopSequence, delay);
    }
    trips.set(tripId, { tripId, upcoming });
  }

  if (vehiclePositions) {
    for (const e of rt.FeedMessage.decode(vehiclePositions).entity) {
      const v = e.vehicle;
      const trip = v?.trip?.tripId ? trips.get(v.trip.tripId) : undefined;
      if (!v || !trip || !v.stopId) continue;
      trip.vehicle = { stopId: v.stopId, stopped: v.currentStatus === STOPPED_AT, at: num(v.timestamp as LongLike) || feedTs };
    }
  }
  return { feedTs, trips };
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchRaw(): Promise<{ tripUpdates: Uint8Array; vehiclePositions: Uint8Array | null }> {
  const [tripUpdates, vehiclePositions] = await Promise.all([
    download(config.tripUpdatesUrl),
    download(config.vehiclePositionsUrl).catch(() => null), // positions only refine; never block on them
  ]);
  return { tripUpdates, vehiclePositions };
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const raw = await fetchRaw();
  return parseFeeds(raw.tripUpdates, raw.vehiclePositions);
}

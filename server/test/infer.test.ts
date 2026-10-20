import { describe, expect, it } from "vitest";
import { frontier, inferArrivals, type InferContext } from "../src/collector/infer.ts";
import type { Snapshot, VehicleState } from "../src/realtime/feed.ts";
import type { TripInfo } from "../src/schedule/service.ts";
import { serviceDayStart } from "../src/time.ts";

const DATE = "20261020"; // a Tuesday
const DAY = serviceDayStart(DATE);
const at = (h: number, m: number, s = 0) => DAY + h * 3600 + m * 60 + s;

// Route 6 trip: stop k (1..8) is scheduled at 8:00 + 5k minutes. Stop 8 is the same pole as stop 1
// (a loop), which the vehicle matching must not confuse.
const stopIds = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S1"];
const trip: TripInfo = {
  tripId: "T1",
  routeId: "6",
  serviceId: "weekday",
  headsign: "Campus",
  stops: new Map(stopIds.map((id, i) => [i + 1, { stopId: id, schedS: 8 * 3600 + 300 * (i + 1) }])),
  firstS: 8 * 3600 + 300,
  lastS: 8 * 3600 + 2400,
  lastSequence: 8,
};

/** BT style: one trip-wide delay for every listed upcoming stop. */
function snap(feedTs: number, firstUpcoming: number | null, delay = 0, vehicle?: Partial<VehicleState>): Snapshot {
  const trips = new Map();
  if (firstUpcoming !== null) {
    const upcoming = new Map<number, number>();
    for (let seq = firstUpcoming; seq <= 8; seq++) upcoming.set(seq, delay);
    trips.set("T1", { tripId: "T1", upcoming, vehicle: vehicle && { stopped: false, at: feedTs, stopId: "", ...vehicle } });
  }
  return { feedTs, trips };
}

function ctx(stopped: Record<string, number> = {}): InferContext {
  return {
    lookup: (id) => (id === "T1" ? { trip, serviceDate: DATE } : null),
    lastStoppedAt: (tripId, stopId) => stopped[`${tripId}|${stopId}`],
  };
}

describe("frontier (first stop not yet left)", () => {
  it("uses the first listed stop, or the vehicle's stop when it is a little ahead", () => {
    expect(frontier(snap(0, 3).trips.get("T1")!, trip)).toBe(3);
    expect(frontier(snap(0, 3, 0, { stopId: "S4" }).trips.get("T1")!, trip)).toBe(4);
  });

  it("ignores vehicle stops behind the list or implausibly far ahead", () => {
    expect(frontier(snap(0, 3, 0, { stopId: "S2" }).trips.get("T1")!, trip)).toBe(3);
    expect(frontier(snap(0, 2, 0, { stopId: "S7" }).trips.get("T1")!, trip)).toBe(2);
  });

  it("matches a repeated stop at the later visit once the bus is past the first", () => {
    expect(frontier(snap(0, 7, 0, { stopId: "S1" }).trips.get("T1")!, trip)).toBe(8);
  });
});

describe("inferArrivals", () => {
  it("records a stop that dropped off the upcoming list, at its predicted time", () => {
    // Stop 3 is due 8:15 + 60 s = 8:16:00; it drops off between 8:15:50 and 8:16:20.
    const out = inferArrivals(snap(at(8, 15, 50), 3, 60), snap(at(8, 16, 20), 4, 60), ctx());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ stopSequence: 3, stopId: "S3", routeId: "6", weekday: 1, delayS: 60, method: "passed" });
    expect(out[0]!.observedAt).toBe(at(8, 16));
  });

  it("counts a stop as left as soon as the vehicle heads to the next one", () => {
    // The trip update still lists stop 3 at 8:16:20, but the bus is already heading to stop 4.
    const out = inferArrivals(snap(at(8, 15, 50), 3, 60), snap(at(8, 16, 20), 3, 60, { stopId: "S4" }), ctx());
    expect(out.map((a) => a.stopSequence)).toEqual([3]);
  });

  it("clamps the estimate into the window in which the stop was left", () => {
    // Predicted 8:15:00 (on time) but still listed at 8:15:40, so it left between 8:15:40 and 8:16:10.
    const out = inferArrivals(snap(at(8, 15, 40), 3, 0), snap(at(8, 16, 10), 4, 60), ctx());
    expect(out[0]).toMatchObject({ observedAt: at(8, 15, 40), delayS: 40 });
  });

  it("records every stop passed between snapshots", () => {
    const out = inferArrivals(snap(at(8, 14, 50), 3, 10), snap(at(8, 15, 20), 5, 10), ctx());
    expect(out.map((a) => a.stopSequence)).toEqual([3, 4]);
  });

  it("uses the last time the bus was seen stopped at the stop", () => {
    const out = inferArrivals(snap(at(8, 15, 0), 3, -120), snap(at(8, 15, 30), 4, 0), ctx({ "T1|S3": at(8, 15, 20) }));
    expect(out[0]).toMatchObject({ method: "stopped_at", observedAt: at(8, 15, 20), delayS: 20 });
  });

  it("counts only a due final stop when the trip leaves the feed", () => {
    expect(inferArrivals(snap(at(8, 39, 50), 8, 0), snap(at(8, 40, 20), null), ctx())).toMatchObject([
      { stopSequence: 8, method: "trip_end" },
    ]);
    // Final stop not due yet: the trip probably vanished for another reason, so record nothing.
    expect(inferArrivals(snap(at(8, 14, 50), 4, 0), snap(at(8, 15, 20), null), ctx())).toEqual([]);
  });

  it("records nothing across a long gap, a stale feed or an impossible delay", () => {
    expect(inferArrivals(snap(at(8, 10), 3), snap(at(8, 20), 4), ctx())).toEqual([]);
    expect(inferArrivals(snap(at(8, 15), 3), snap(at(8, 15), 4), ctx())).toEqual([]);
    // BT sometimes leaves a bus on a long-finished trip with hours of "delay".
    expect(inferArrivals(snap(at(8, 15), 3, 9720), snap(at(8, 15, 30), 4, 9780), ctx())).toEqual([]);
  });

  it("ignores trips missing from the schedule", () => {
    const prev = snap(at(8, 15), 3);
    prev.trips.set("GHOST", { tripId: "GHOST", upcoming: new Map([[1, 0]]) });
    expect(inferArrivals(prev, snap(at(8, 15, 30), 4), ctx()).map((a) => a.tripId)).toEqual(["T1"]);
  });
});

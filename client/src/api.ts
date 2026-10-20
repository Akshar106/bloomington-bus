import { useEffect, useMemo, useState } from "react";

// --- Types returned by the server (see server/src/api) ---

export type Route = { id: string; shortName: string; longName: string; color: string; textColor: string };
export type Stop = { id: string; name: string; lat: number; lon: number; routes: string[] };
export type Summary = { count: number; medianDelayS: number; onTimePct: number; earlyPct: number; latePct: number };
export type DayType = "weekday" | "saturday" | "sunday";

export type Departure = {
  tripId: string;
  routeId: string;
  destination: string;
  scheduledAt: number;
  expectedAt: number;
  delayS: number | null;
  usual: Summary | null;
};
export type Departures = { live: boolean; generatedAt: number; departures: Departure[] };
export type Timetable = { day: DayType; rows: { routeId: string; destination: string; schedS: number; stats: Summary | null }[] };
export type RouteDetail = {
  route: Route;
  stats: Summary | null;
  directions: { destination: string; stats: Summary | null; stops: { id: string; name: string; stats: Summary | null }[] }[];
};
export type Status = {
  collectingSince: number | null;
  lastCollectedAt: number | null;
  feedAgeS: number | null;
  lastError: string | null;
  departuresRecorded: number;
  departuresLast24h: number;
  daysWithData: number;
  firstDay: string | null;
  historyDays: number;
};

// --- Fetching ---

export type Loadable<T> = { data?: T; error?: string; loading: boolean };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(res.status === 404 ? "Not found" : `The server returned an error (${res.status}).`);
  return (await res.json()) as T;
}

/** Loads /api{path}; refreshes every refreshMs while the tab is visible. */
export function useApi<T>(path: string, refreshMs?: number): Loadable<T> {
  const [state, setState] = useState<Loadable<T> & { path?: string }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getJson<T>(path).then(
        (data) => !cancelled && setState({ data, loading: false, path }),
        (err: unknown) =>
          !cancelled &&
          setState((s) => ({ ...s, loading: false, path, error: err instanceof Error ? err.message : "Couldn't load data." })),
      );
    void load();
    const timer = refreshMs ? setInterval(() => !document.hidden && void load(), refreshMs) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [path, refreshMs]);

  // While a new path loads, don't show the previous page's data.
  return state.path === path ? state : { loading: true };
}

// Stops and routes change only when BT publishes a new schedule, so load them once per visit.
const cache = new Map<string, Promise<unknown>>();
function useOnce<T>(path: string): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ loading: true });
  useEffect(() => {
    if (!cache.has(path)) cache.set(path, getJson<T>(path).catch((e: unknown) => (cache.delete(path), Promise.reject(e))));
    let cancelled = false;
    (cache.get(path) as Promise<T>).then(
      (data) => !cancelled && setState({ data, loading: false }),
      (err: unknown) => !cancelled && setState({ loading: false, error: err instanceof Error ? err.message : "Couldn't load data." }),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}

export const useStops = () => useOnce<Stop[]>("/stops");
export const useRoutes = () => useOnce<Route[]>("/routes");

/** Routes by id, for badges. Empty until loaded. */
export function useRouteMap(): Map<string, Route> {
  const { data } = useRoutes();
  return useMemo(() => new Map((data ?? []).map((r) => [r.id, r])), [data]);
}

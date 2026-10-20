import { useState } from "react";
import { Link, useParams } from "react-router";
import { useApi, useRouteMap, useStops, type DayType, type Departures, type Timetable } from "../api.ts";
import { RouteBadge } from "../components/RouteBadge.tsx";
import { useFavorites } from "../lib/favorites.ts";
import { clock, clockFromSchedule, delayLabel, minutesAway, toneOf, usually } from "../lib/format.ts";
import { NotFoundPage } from "./NotFoundPage.tsx";
import styles from "./StopPage.module.css";

const DAY_LABELS: Record<DayType, string> = { weekday: "Weekdays", saturday: "Saturday", sunday: "Sunday" };

/** Today's kind of day in Bloomington. */
function todayType(): DayType {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date());
  return day === "Sat" ? "saturday" : day === "Sun" ? "sunday" : "weekday";
}

/** Seconds since midnight in Bloomington, to compare against timetable times. */
function nowOfDayS(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "numeric", minute: "numeric" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return Number(parts.hour) * 3600 + Number(parts.minute) * 60;
}

export function StopPage() {
  const { stopId = "" } = useParams();
  const { data: stops, loading } = useStops();
  const routes = useRouteMap();
  const { isFavorite, toggle } = useFavorites();
  const stop = stops?.find((s) => s.id === stopId);

  if (!stop) return loading ? <p className="muted">Loading…</p> : <NotFoundPage what="stop" />;
  const favorite = isFavorite(stop.id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{stop.name}</h1>
          <div className={styles.routes}>
            {stop.routes.map((id) => (
              <Link key={id} to={`/route/${encodeURIComponent(id)}`} aria-label={`Route ${routes.get(id)?.shortName ?? id}`}>
                <RouteBadge routeId={id} route={routes.get(id)} />
              </Link>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={styles.star}
          aria-pressed={favorite}
          aria-label={favorite ? "Remove from your stops" : "Add to your stops"}
          onClick={() => toggle(stop.id)}
        >
          {favorite ? "★" : "☆"}
        </button>
      </header>
      <NextBuses stopId={stop.id} />
      <TrackRecord stopId={stop.id} />
    </div>
  );
}

function NextBuses({ stopId }: { stopId: string }) {
  const { data, error } = useApi<Departures>(`/stops/${encodeURIComponent(stopId)}/departures`, 30_000);
  const routes = useRouteMap();

  return (
    <section>
      <div className={styles.sectionHead}>
        <h2>Next buses</h2>
        {data && <span className="muted small">Updated {clock(data.generatedAt)}</span>}
      </div>
      {error && !data && <p className="late">Couldn't load departures: {error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && !data.live && (
        <p className={`small ${styles.notice}`}>Live tracking is unavailable right now, so these are timetable times.</p>
      )}
      {data && data.departures.length === 0 && <p className="muted">No buses scheduled here in the next two hours.</p>}
      {data && data.departures.length > 0 && (
        <ul className={`card ${styles.departures}`}>
          {data.departures.map((d) => {
            const tone = toneOf(d.delayS);
            return (
              <li key={d.tripId} className={styles.departure}>
                <div className={styles.when}>
                  <span className={styles.away}>{minutesAway(d.expectedAt, data.generatedAt)}</span>
                  <span className="muted small">{clock(d.expectedAt)}</span>
                </div>
                <div className={styles.what}>
                  <span className={styles.routeLine}>
                    <RouteBadge routeId={d.routeId} route={routes.get(d.routeId)} />
                    <span>to {d.destination}</span>
                  </span>
                  <span className="small">
                    <span className={tone === "unknown" ? "muted" : tone}>{delayLabel(d.delayS)}</span>
                    {d.delayS !== null && d.delayS !== 0 && <span className="muted"> (due {clock(d.scheduledAt)})</span>}
                    {d.usual && <span className="muted"> · {usually(d.usual)}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TrackRecord({ stopId }: { stopId: string }) {
  const [day, setDay] = useState<DayType>(todayType);
  const [showAll, setShowAll] = useState(false);
  const { data, error } = useApi<Timetable>(`/stops/${encodeURIComponent(stopId)}/timetable?day=${day}`);
  const routes = useRouteMap();

  const isToday = day === todayType();
  const from = nowOfDayS() - 30 * 60;
  const rows = data?.rows.filter((r) => showAll || !isToday || r.schedS >= from) ?? [];
  const hidden = (data?.rows.length ?? 0) - rows.length;

  return (
    <section>
      <div className={styles.sectionHead}>
        <h2>How late each bus runs</h2>
      </div>
      <p className="muted small">
        Last 28 days. On time means from 1 minute early to 5 minutes late. A bus needs 3 recorded days before it gets a
        number.
      </p>
      <div className={styles.tabs} role="group" aria-label="Kind of day">
        {(Object.keys(DAY_LABELS) as DayType[]).map((d) => (
          <button key={d} type="button" aria-pressed={d === day} onClick={() => setDay(d)}>
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>
      {error && <p className="late">Couldn't load the timetable: {error}</p>}
      {data && data.rows.length === 0 && <p className="muted">No buses leave this stop on {DAY_LABELS[day].toLowerCase()}.</p>}
      {rows.length > 0 && (
        <table className={`card ${styles.table}`}>
          <thead>
            <tr>
              <th scope="col" className={styles.timeCol}>
                Time
              </th>
              <th scope="col">Bus</th>
              <th scope="col" className={styles.recordCol}>
                Record
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.routeId}-${r.destination}-${r.schedS}`}>
                <td className={styles.time}>{clockFromSchedule(r.schedS)}</td>
                <td>
                  <span className={styles.bus}>
                    <RouteBadge routeId={r.routeId} route={routes.get(r.routeId)} />
                    <span className={`small ${styles.destination}`} title={`to ${r.destination}`}>
                      to {r.destination}
                    </span>
                  </span>
                </td>
                <td className="small">
                  {r.stats ? (
                    <>
                      <span className={toneOf(r.stats.medianDelayS)}>{delayLabel(r.stats.medianDelayS)}</span>
                      <br />
                      <span className="muted">
                        {r.stats.onTimePct}% on time, {r.stats.count} days
                      </span>
                    </>
                  ) : (
                    <span className="muted">Not enough data yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <button type="button" className={styles.linkButton} onClick={() => setShowAll(true)}>
          Show {hidden} earlier buses
        </button>
      )}
    </section>
  );
}

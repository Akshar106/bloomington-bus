import { useState } from "react";
import { Link, useParams } from "react-router";
import { useApi, type RouteDetail, type Summary } from "../api.ts";
import { RouteBadge } from "../components/RouteBadge.tsx";
import { delayLabel, toneOf } from "../lib/format.ts";
import { NotFoundPage } from "./NotFoundPage.tsx";
import styles from "./RoutePage.module.css";

function Record({ stats }: { stats: Summary | null }) {
  if (!stats) return <span className="muted small">Not enough data yet</span>;
  return (
    <span className="small">
      <strong>{stats.onTimePct}% on time</strong> · <span className={toneOf(stats.medianDelayS)}>usually {delayLabel(stats.medianDelayS).toLowerCase()}</span>
    </span>
  );
}

export function RoutePage() {
  const { routeId = "" } = useParams();
  const { data, error } = useApi<RouteDetail>(`/routes/${encodeURIComponent(routeId)}`);
  const [direction, setDirection] = useState(0);

  if (error === "Not found") return <NotFoundPage what="route" />;
  if (error) return <p className="late">Couldn't load this route: {error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const dir = data.directions[direction] ?? data.directions[0];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <RouteBadge routeId={data.route.id} route={data.route} />
        <h1>{data.route.longName}</h1>
      </header>
      <p className={`card ${styles.summary}`}>
        <Record stats={data.stats} />
        {data.stats && <span className="muted small">{data.stats.count.toLocaleString()} departures in the last 28 days</span>}
      </p>

      {data.directions.length > 1 && (
        <div className={styles.tabs} role="group" aria-label="Direction">
          {data.directions.map((d, i) => (
            <button key={d.destination} type="button" aria-pressed={i === direction} onClick={() => setDirection(i)}>
              To {d.destination}
            </button>
          ))}
        </div>
      )}

      {dir && (
        <ol className={`card ${styles.stops}`}>
          {dir.stops.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <Link to={`/stop/${s.id}`} className={styles.stop}>
                <span className={styles.name}>{s.name}</span>
                <Record stats={s.stats} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

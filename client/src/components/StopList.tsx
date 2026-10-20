import { Link } from "react-router";
import { useRouteMap, type Stop } from "../api.ts";
import { formatDistance } from "../lib/search.ts";
import { RouteBadge } from "./RouteBadge.tsx";
import styles from "./StopList.module.css";

export function StopList({ stops }: { stops: (Stop & { distanceM?: number })[] }) {
  const routes = useRouteMap();
  return (
    <ul className={`card ${styles.list}`}>
      {stops.map((stop) => (
        <li key={stop.id}>
          <Link to={`/stop/${stop.id}`} className={styles.item}>
            <span className={styles.name}>
              {stop.name}
              {stop.distanceM !== undefined && <span className="muted small"> · {formatDistance(stop.distanceM)}</span>}
            </span>
            <span className={styles.routes}>
              {stop.routes.map((id) => (
                <RouteBadge key={id} routeId={id} route={routes.get(id)} />
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

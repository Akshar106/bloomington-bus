import { Link } from "react-router";
import { useRoutes } from "../api.ts";
import { RouteBadge } from "../components/RouteBadge.tsx";
import styles from "./RoutesPage.module.css";

export function RoutesPage() {
  const { data: routes, error } = useRoutes();
  return (
    <div>
      <h1 className={styles.title}>Routes</h1>
      {error && <p className="late">Couldn't load routes: {error}</p>}
      {!routes && !error && <p className="muted">Loading…</p>}
      {routes && (
        <ul className={`card ${styles.list}`}>
          {routes.map((r) => (
            <li key={r.id}>
              <Link to={`/route/${encodeURIComponent(r.id)}`} className={styles.item}>
                <RouteBadge routeId={r.id} route={r} />
                <span>{r.longName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

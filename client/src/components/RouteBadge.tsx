import type { Route } from "../api.ts";
import styles from "./RouteBadge.module.css";

export function RouteBadge({ route, routeId }: { route?: Route; routeId: string }) {
  return (
    <span
      className={styles.badge}
      style={route ? { background: route.color, color: route.textColor } : undefined}
      title={route?.longName}
    >
      {route?.shortName ?? routeId}
    </span>
  );
}

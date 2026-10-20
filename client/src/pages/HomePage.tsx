import { useMemo, useState } from "react";
import { useStops, type Stop } from "../api.ts";
import { StopList } from "../components/StopList.tsx";
import { useFavorites } from "../lib/favorites.ts";
import { nearestStops, searchStops } from "../lib/search.ts";
import styles from "./HomePage.module.css";

type Nearby = { status: "idle" | "locating" | "error"; message?: string; stops?: (Stop & { distanceM: number })[] };

export function HomePage() {
  const { data: stops, error } = useStops();
  const { ids: favoriteIds } = useFavorites();
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<Nearby>({ status: "idle" });

  const results = useMemo(() => (stops ? searchStops(stops, query) : []), [stops, query]);
  const favorites = useMemo(() => (stops ?? []).filter((s) => favoriteIds.includes(s.id)), [stops, favoriteIds]);

  function findNearby() {
    if (!navigator.geolocation) return setNearby({ status: "error", message: "Your browser can't share its location." });
    setNearby({ status: "locating" });
    // The position stays in the browser: nearest stops are worked out right here.
    navigator.geolocation.getCurrentPosition(
      (pos) => setNearby({ status: "idle", stops: nearestStops(stops ?? [], pos.coords.latitude, pos.coords.longitude) }),
      (err) =>
        setNearby({
          status: "error",
          message: err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.",
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>When's my bus, really?</h1>
        <p className="muted">Live Bloomington Transit times, plus how late each bus usually runs.</p>
      </section>

      <section>
        <label htmlFor="stop-search" className={styles.label}>
          Find a stop
        </label>
        <div className={styles.searchRow}>
          <input
            id="stop-search"
            type="search"
            className={styles.search}
            placeholder="e.g. Wells Library, IMU, Kirkwood"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <button type="button" className={styles.nearButton} onClick={findNearby} disabled={!stops || nearby.status === "locating"}>
            {nearby.status === "locating" ? "Locating…" : "Near me"}
          </button>
        </div>
        {error && <p className="late">Couldn't load stops: {error}</p>}
        {nearby.status === "error" && <p className="late small">{nearby.message}</p>}
      </section>

      {query.trim() !== "" && (
        <section aria-live="polite">
          <h2 className={styles.heading}>{results.length ? "Matching stops" : "No stops match"}</h2>
          {results.length > 0 && <StopList stops={results} />}
        </section>
      )}

      {nearby.stops && (
        <section>
          <h2 className={styles.heading}>Closest stops</h2>
          <StopList stops={nearby.stops} />
        </section>
      )}

      {favorites.length > 0 && (
        <section>
          <h2 className={styles.heading}>Your stops</h2>
          <StopList stops={favorites} />
        </section>
      )}

      {favorites.length === 0 && !query && !nearby.stops && (
        <p className="muted small">Tip: open a stop and tap ☆ to keep it here.</p>
      )}
    </div>
  );
}

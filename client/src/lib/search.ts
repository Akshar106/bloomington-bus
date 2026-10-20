import type { Stop } from "../api.ts";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Stops whose name contains every word typed, best matches (name starts with the query) first. */
export function searchStops(stops: Stop[], query: string, limit = 20): Stop[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(" ");
  return stops
    .map((stop) => ({ stop, name: normalize(stop.name) }))
    .filter(({ name }) => words.every((w) => name.includes(w)))
    .sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ stop }) => stop);
}

/** Straight-line distance in meters (haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export function nearestStops(stops: Stop[], lat: number, lon: number, limit = 8): (Stop & { distanceM: number })[] {
  return stops
    .map((s) => ({ ...s, distanceM: distanceM(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** "450 ft" or "0.4 mi". */
export function formatDistance(m: number): string {
  const feet = m * 3.28084;
  return feet < 1000 ? `${Math.round(feet / 10) * 10} ft` : `${(m / 1609.34).toFixed(1)} mi`;
}

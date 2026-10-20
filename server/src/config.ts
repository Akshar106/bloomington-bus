import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Bloomington Transit publishes its feeds through its vendor, ETA Transit Systems. No API key needed.
const FEED_BASE = "https://s3.amazonaws.com/etatransit.gtfs/bloomingtontransit.etaspot.net";

export const config = {
  timezone: "America/New_York",
  scheduleUrl: `${FEED_BASE}/gtfs.zip`,
  tripUpdatesUrl: `${FEED_BASE}/trip_updates.pb`,
  vehiclePositionsUrl: `${FEED_BASE}/position_updates.pb`,
  dbPath: process.env.DB_PATH ?? path.join(root, "data", "bus.sqlite"),
  clientDist: path.join(root, "client", "dist"),
  port: Number(process.env.PORT ?? 3000),
  pollSeconds: 30,
  // A bus counts as on time from 1 minute early to 5 minutes late (the usual US transit definition).
  onTimeEarlyS: -60,
  onTimeLateS: 300,
};

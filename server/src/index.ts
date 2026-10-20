// Starts the web server.   COLLECT=true also runs the collector in this process (used when deployed).
import { createApp } from "./app.ts";
import { startCollector } from "./collector/collector.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { refreshSchedule } from "./schedule/importer.ts";

const db = openDb();
const { n } = db.prepare("SELECT COUNT(*) AS n FROM routes").get() as { n: number };
if (n === 0) {
  console.log("No schedule yet; downloading Bloomington Transit's GTFS…");
  await refreshSchedule(db, true);
}

if (process.env.COLLECT === "true") startCollector(db);

createApp(db).listen(config.port, () => console.log(`Bloomington Bus on http://localhost:${config.port}`));

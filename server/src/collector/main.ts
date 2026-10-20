// npm run collect: polls Bloomington Transit every 30 s and stores departures until stopped.
import { openDb } from "../db.ts";
import { startCollector } from "./collector.ts";

const db = openDb();
const stop = startCollector(db);
console.log("Collecting Bloomington Transit departures every 30 s. Ctrl+C to stop.");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stop();
    db.close();
    process.exit(0);
  });
}

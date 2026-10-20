// npm run import-schedule [-- --force]
import { openDb } from "../db.ts";
import { refreshSchedule } from "./importer.ts";

const db = openDb();
const result = await refreshSchedule(db, process.argv.includes("--force"));
console.log(result ? `Imported schedule: ${JSON.stringify(result)}` : "Schedule already up to date.");
db.close();

// Packs the laptop's database into data/snapshot/bus.sqlite.gz for a test deploy, keeping the last
// 28 days of history. Safe while the collector is running (uses SQLite's online backup). The server
// unpacks it on first start.   npm run snapshot
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { HISTORY_DAYS } from "../src/api/stats.ts";
import { config } from "../src/config.ts";

const out = path.join(path.dirname(config.dbPath), "snapshot", "bus.sqlite");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });

const source = new Database(config.dbPath, { readonly: true });
await source.backup(out);
source.close();

const db = new Database(out);
db.pragma("journal_mode = DELETE"); // a single self-contained file, no -wal/-shm companions
const cutoff = Math.floor(Date.now() / 1000) - HISTORY_DAYS * 86400;
const removed = db.prepare("DELETE FROM arrivals WHERE observed_at < ?").run(cutoff).changes;
db.exec("VACUUM");
const { n } = db.prepare("SELECT COUNT(*) AS n FROM arrivals").get() as { n: number };
db.close();

const raw = fs.readFileSync(out);
fs.writeFileSync(`${out}.gz`, zlib.gzipSync(raw, { level: 9 }));
fs.rmSync(out);
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
console.log(
  `Wrote ${out}.gz: ${n.toLocaleString()} departures (${removed} older ones dropped), ` +
    `${mb(raw.length)} -> ${mb(fs.statSync(`${out}.gz`).size)} gzipped`,
);

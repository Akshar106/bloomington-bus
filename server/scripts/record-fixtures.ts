// Saves consecutive raw feed snapshots for replay tests:
//   node scripts/record-fixtures.ts [count=5] [intervalSeconds=30]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRaw } from "../src/realtime/feed.ts";

const count = Number(process.argv[2] ?? 5);
const interval = Number(process.argv[3] ?? 30);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "snapshots");
fs.mkdirSync(dir, { recursive: true });

for (let i = 0; i < count; i++) {
  if (i > 0) await new Promise((r) => setTimeout(r, interval * 1000));
  const raw = await fetchRaw();
  const name = String(i).padStart(2, "0");
  fs.writeFileSync(path.join(dir, `${name}-trip_updates.pb`), raw.tripUpdates);
  if (raw.vehiclePositions) fs.writeFileSync(path.join(dir, `${name}-vehicle_positions.pb`), raw.vehiclePositions);
  console.log(`saved snapshot ${name}`);
}

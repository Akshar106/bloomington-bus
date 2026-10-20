# Bloomington Bus

**When is the next Bloomington Transit bus really coming, and how late does it usually run?**

A small web app for IU students. It shows live arrivals at any Bloomington Transit (BT) stop and the track record of every scheduled bus ("the 8:10 AM Route 6 at Wells Library is usually 3 minutes late, on time 70% of weekdays"), built from data it collects itself.

> Unofficial student project. Not affiliated with Bloomington Transit or Indiana University.

## What it does

- **Find a stop** by name, or tap **Near me**. Your location is used only in your browser.
- **Next buses** at a stop, refreshed every 30 seconds, adjusted by BT's live feed.
- **How late each bus runs:** every scheduled departure on weekdays, Saturdays or Sundays with its median delay and on-time rate over the last 28 days. On time means from 1 minute early to 5 minutes late.
- **Route pages** with each stop's record, and **starred stops** saved in the browser (no accounts).

## How it works

```
BT schedule (gtfs.zip) ──import──▶ SQLite ◀──departures── collector (every 30 s)
BT live feed (trip updates + vehicle positions) ────────────────┘   │
                                                                     ▼
                          React app ◀──JSON── Express API (same Node process)
```

BT publishes its schedule and a GTFS-Realtime feed through its vendor, ETA Transit Systems. Both are free and need no key. Recording a few snapshots showed what the live feed contains:

- **Trip updates** list each bus's *upcoming* stops with one trip-wide delay, in whole minutes, and no absolute times or stop IDs. Everything is joined to the schedule by trip and stop sequence.
- **Vehicle positions** name the stop each bus is heading to. They run about 30 seconds ahead of the trip updates.
- Some buses stay attached to long-finished trips with hours of "delay". Anything over an hour is ignored.

The collector compares consecutive snapshots. When a bus's position moves past a stop, the bus left that stop in the last 30 seconds. The collector records when, placing it inside that window using the earlier prediction, and stores it next to the scheduled time. Gaps longer than 3 minutes, such as a laptop asleep, are skipped rather than guessed. See [`server/src/collector/infer.ts`](server/src/collector/infer.ts).

## Tech

| Part | Tools |
|---|---|
| Frontend | React, TypeScript, Vite, React Router, CSS Modules |
| Backend | Node.js 24+ (runs TypeScript directly), Express, SQLite (`better-sqlite3`), `gtfs-realtime-bindings` |
| Tests | Vitest: time-zone math including DST, detection rules, a replay of real recorded feed snapshots, API |
| Hosting | Render free tier, for test deploys |

## Run it locally

Requires Node.js 24 or newer.

```bash
npm install
npm run import-schedule      # downloads BT's schedule into data/bus.sqlite
scripts/collector.sh start   # collects departures in the background (stop | status)
npm run dev:server           # API on http://localhost:3000
npm run dev:client           # app on http://localhost:5173
```

If those ports are taken, run `PORT=3200 npm run dev:server` and `API_URL=http://localhost:3200 npm run dev:client -- --port 5180`.

Checks: `npm test`, `npm run typecheck`, `npm run lint`. Production mode is `npm run build && npm start` (one server on port 3000).

On macOS, the collector script also keeps the laptop from idle-sleeping while it runs. Closing the lid still sleeps it, and that shows up as a gap in the data.

## Test deploy on Render (free)

Render's free web services sleep after 15 minutes without visitors and reset their disk on restart. So the deploy ships a snapshot of the history collected on your laptop and keeps collecting while awake.

1. `npm run snapshot` writes `data/snapshot/bus.sqlite.gz` (the last 28 days). Commit it and push to GitHub.
2. On render.com, choose **New → Blueprint** and pick the repo. [`render.yaml`](render.yaml) sets everything up.
3. Try it. The first visit after a sleep takes up to a minute.
4. Delete the service in Render's dashboard when you're done.

## Project layout

```text
client/   React app (pages, components, formatting and search helpers)
server/   API, schedule import, live-feed reader, collector, tests and fixtures
scripts/  collector.sh: run the collector in the background
data/     the SQLite database (git-ignored)
```

## Data and license

Schedule and live data come from Bloomington Transit's public GTFS and GTFS-Realtime feeds. The code is MIT licensed.

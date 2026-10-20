import { useApi, type Status } from "../api.ts";
import { clock } from "../lib/format.ts";
import styles from "./AboutPage.module.css";

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

export function AboutPage() {
  const { data: status } = useApi<Status>("/status", 60_000);

  return (
    <article className={styles.page}>
      <h1>About</h1>
      <p>
        Bloomington Bus shows when the next Bloomington Transit bus will really come, and how late each scheduled bus
        usually runs, so you can decide whether to leave a few minutes later.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>Every 30 seconds it reads BT's public live feed: where each bus is, and how far behind schedule it is.</li>
        <li>When a bus moves past a stop, it records when that happened and compares it with the timetable.</li>
        <li>
          A bus's record is the median of those differences over the last 28 days. <strong>On time</strong> means from 1
          minute early to 5 minutes late.
        </li>
      </ul>

      <h2>Data so far</h2>
      {status ? (
        <dl className={`card ${styles.facts}`}>
          <div>
            <dt>Collecting since</dt>
            <dd>{status.collectingSince ? dateFormat.format(new Date(status.collectingSince * 1000)) : "Not started"}</dd>
          </div>
          <div>
            <dt>Bus departures recorded</dt>
            <dd>{status.departuresRecorded.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Days with data</dt>
            <dd>{status.daysWithData}</dd>
          </div>
          <div>
            <dt>Last update</dt>
            <dd>{status.lastCollectedAt ? clock(status.lastCollectedAt) : "—"}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted">Loading…</p>
      )}

      <h2>Privacy</h2>
      <p>
        No accounts. "Near me" uses your location only inside your browser to find the closest stops; it is never sent
        to the server. Starred stops are saved in your browser too.
      </p>

      <h2>Caveats</h2>
      <p>
        This is an unofficial student project, not affiliated with Bloomington Transit or Indiana University. Times are
        estimates from BT's public feed, which can be wrong or late. Check BT's official channels for detours and
        service changes.
      </p>
    </article>
  );
}

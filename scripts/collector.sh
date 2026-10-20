#!/usr/bin/env bash
# Runs the data collector in the background on your laptop, so reliability history builds up.
#   scripts/collector.sh start | stop | status
# On macOS it also keeps the laptop from idle-sleeping while the collector runs (closing the lid
# still sleeps it, which shows up as a gap in the data).
set -euo pipefail
cd "$(dirname "$0")/.."
PID_FILE=data/collector.pid
LOG=data/collector.log
mkdir -p data

running() { [[ -f $PID_FILE ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }

case "${1:-status}" in
  start)
    if running; then echo "Already running (pid $(cat $PID_FILE))."; exit 0; fi
    nohup node server/src/collector/main.ts >>"$LOG" 2>&1 &
    echo $! >"$PID_FILE"
    if command -v caffeinate >/dev/null; then nohup caffeinate -i -w "$(cat $PID_FILE)" >/dev/null 2>&1 & fi
    echo "Collector started (pid $(cat $PID_FILE)). Log: $LOG"
    ;;
  stop)
    if running; then kill "$(cat $PID_FILE)" && echo "Collector stopped."; else echo "Not running."; fi
    rm -f "$PID_FILE"
    ;;
  status)
    if running; then echo "Running (pid $(cat $PID_FILE))."; else echo "Not running."; fi
    tail -n 3 "$LOG" 2>/dev/null || true
    ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac

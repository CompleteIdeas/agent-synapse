#!/bin/bash
# Notification hook: Fires when background tasks (sleep timers) complete.
# Checks if the coordinator's monitoring loop has stalled and injects a reminder.
#
# This is the external enforcement mechanism — even if the LLM forgets
# to re-enter the loop, this hook catches it on the next tool use.
#
# Install in .claude/settings.json as a Notification hook for the coordinator role.

INPUT=$(cat)

# Only care about coordinator sessions
if [ -z "$WORKER_NAME" ] || [ "$WORKER_NAME" != "coordinator" ]; then
  exit 0
fi

# Find state file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Hook is at <project>/hooks/coordinator-watchdog.sh
# State file is at <project>/coordinator_state.json
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$PROJECT_ROOT/coordinator_state.json"

if [ ! -f "$STATE_FILE" ]; then
  # No state file yet — coordinator hasn't completed first cycle
  exit 0
fi

# Check last_tick_at — if older than 300 seconds (5 min), the loop has stalled
LAST_TICK=$(sed -n 's/.*"last_tick_at"\s*:\s*"\([^"]*\)".*/\1/p' "$STATE_FILE" | head -1)

if [ -z "$LAST_TICK" ]; then
  exit 0
fi

# Convert ISO timestamp to epoch seconds
# Use python for cross-platform date parsing (Windows Git Bash date is limited)
NOW_EPOCH=$(python -c "import time; print(int(time.time()))" 2>/dev/null)
TICK_EPOCH=$(python -c "
from datetime import datetime
try:
    dt = datetime.fromisoformat('$LAST_TICK'.replace('Z', '+00:00'))
    print(int(dt.timestamp()))
except:
    print(0)
" 2>/dev/null)

if [ -z "$NOW_EPOCH" ] || [ -z "$TICK_EPOCH" ] || [ "$TICK_EPOCH" = "0" ]; then
  exit 0
fi

ELAPSED=$((NOW_EPOCH - TICK_EPOCH))

# If more than 300 seconds since last tick, the loop has stalled
if [ "$ELAPSED" -gt 300 ]; then
  MINUTES=$((ELAPSED / 60))
  cat <<ENDJSON
{
  "hookSpecificOutput": {
    "hookEventName": "Notification",
    "message": "LOOP STALLED: Your monitoring loop hasn't ticked in ${MINUTES} minutes (last: $LAST_TICK). Re-enter the loop NOW: schedule sleep 180 (run_in_background), then run a full monitoring cycle. Read coordinator_state.json to recover your state."
  }
}
ENDJSON
fi

# Run stale recovery automatically on each coordinator Notification event.
# This detects workers that disconnected without checkout and recovers their tasks.
# The script is idempotent and lightweight — safe to run on every tick.
bash "$SCRIPT_DIR/stale-recovery.sh" >/dev/null 2>&1 &

exit 0

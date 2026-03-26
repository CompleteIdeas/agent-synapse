#!/bin/bash
# Stale Recovery Script: Detect stale workers and reassign their tasks.
#
# Run by the coordinator (or manually) to recover from workers that
# disconnected without proper checkout. Finds agents whose lastSeen
# is older than the threshold and:
#   1. Reassigns their in_progress tasks back to pending
#   2. Releases their file locks
#   3. Marks them as dead
#
# Usage:
#   bash hooks/stale-recovery.sh              # default threshold from config
#   bash hooks/stale-recovery.sh 300          # custom threshold in seconds
#   SYNAPSE_STALE_THRESHOLD=180 bash hooks/stale-recovery.sh
#   COORD_URL=http://host:8400 bash hooks/stale-recovery.sh
#
# Threshold priority: CLI arg > SYNAPSE_STALE_THRESHOLD env > synapse.config.json > 120s default
# Safe to run repeatedly — idempotent.

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

# Resolve stale threshold: CLI arg > env var > synapse.config.json > default 120s
if [ -n "$1" ]; then
  STALE_THRESHOLD_SECS="$1"
elif [ -n "$SYNAPSE_STALE_THRESHOLD" ]; then
  STALE_THRESHOLD_SECS="$SYNAPSE_STALE_THRESHOLD"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  CONFIG_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/synapse.config.json"
  if [ -f "$CONFIG_FILE" ]; then
    STALE_THRESHOLD_SECS=$(python -c "
import json
try:
    c = json.load(open('$CONFIG_FILE'))
    print(c.get('stale_threshold_seconds', 120))
except:
    print(120)
" 2>/dev/null)
  fi
  STALE_THRESHOLD_SECS="${STALE_THRESHOLD_SECS:-120}"
fi

# Get all workers
WORKERS=$(curl -s --max-time 5 "$COORDINATOR/workers" 2>/dev/null)
if [ -z "$WORKERS" ]; then
  echo "stale-recovery: coordinator unreachable at $COORDINATOR"
  exit 1
fi

# Get current time in epoch seconds
NOW=$(python -c "import time; print(int(time.time()))" 2>/dev/null)
if [ -z "$NOW" ]; then
  echo "stale-recovery: python not available for time calculation"
  exit 1
fi

# Find stale agents and recover them
python -c "
import json, sys
from datetime import datetime, timezone

threshold = $STALE_THRESHOLD_SECS
now = $NOW

try:
    data = json.loads('''$WORKERS''')
    workers = data.get('workers', data.get('agents', []))
    if not isinstance(workers, list):
        workers = []
except:
    workers = []
    print('stale-recovery: failed to parse workers response', file=sys.stderr)

stale = []
for w in workers:
    last_seen = w.get('last_seen_at', w.get('lastSeen', ''))
    if not last_seen:
        continue
    try:
        # Parse ISO timestamp
        ts = last_seen.replace('Z', '+00:00')
        dt = datetime.fromisoformat(ts)
        epoch = int(dt.timestamp())
        age = now - epoch
        if age > threshold:
            stale.append({
                'id': w.get('id', ''),
                'name': w.get('name', 'unknown'),
                'age_secs': age,
                'status': w.get('status', '')
            })
    except:
        pass

if not stale:
    print('stale-recovery: no stale workers found')
    sys.exit(0)

for s in stale:
    print(f\"stale-recovery: {s['name']} (id={s['id']}) stale for {s['age_secs']}s\")

# Output agent IDs for the bash loop
for s in stale:
    print(f\"STALE_AGENT|{s['id']}|{s['name']}\")
" 2>&1 | while IFS= read -r line; do
  # Pass through info lines
  if [[ "$line" != STALE_AGENT* ]]; then
    echo "$line"
    continue
  fi

  # Parse stale agent info
  IFS='|' read -r _ AGENT_ID AGENT_NAME <<< "$line"

  echo "stale-recovery: recovering $AGENT_NAME ($AGENT_ID)..."

  # 1. Get their assignment and reassign to pending
  ASSIGNMENT=$(curl -s --max-time 3 "$COORDINATOR/assignment?agentId=$AGENT_ID" 2>/dev/null)
  if [ -n "$ASSIGNMENT" ]; then
    ASSIGN_ID=$(echo "$ASSIGNMENT" | python -c "
import json, sys
try:
    data = json.load(sys.stdin)
    a = data.get('assignment', data)
    if a.get('status') == 'in_progress':
        print(a.get('id', ''))
except:
    pass
" 2>/dev/null)

    if [ -n "$ASSIGN_ID" ]; then
      # Reassign to pending (no target = back to pool)
      curl -s --max-time 3 -X POST "$COORDINATOR/reassign" \
        -H "Content-Type: application/json" \
        -d "{\"assignmentId\":\"$ASSIGN_ID\"}" >/dev/null 2>&1
      echo "  -> reassigned task $ASSIGN_ID to pending"
    fi
  fi

  # 2. Kill the agent (releases locks, marks dead)
  curl -s --max-time 3 -X DELETE "$COORDINATOR/agent/$AGENT_ID" >/dev/null 2>&1
  echo "  -> agent marked dead, locks released"

  # 3. Report finding
  curl -s --max-time 3 -X POST "$COORDINATOR/finding" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"stale_recovery\",\"severity\":\"warning\",\"description\":\"$AGENT_NAME was stale — task reassigned, agent killed\"}" >/dev/null 2>&1
done

echo "stale-recovery: done"
exit 0

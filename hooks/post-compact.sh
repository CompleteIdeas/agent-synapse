#!/bin/bash
# PostCompact hook: Signal the agent to restore AWM context after compaction.
#
# After context compaction, the LLM loses in-context memory. This hook:
#   1. Ensures the breadcrumb file (written by PreCompact) exists
#   2. Writes a recovery signal file that the agent checks post-compaction
#   3. Posts a lightweight event to the coordinator so it knows compaction happened
#
# The agent's own protocol handles memory_restore — this hook provides
# the safety net of signaling and coordinator awareness.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

# Write a recovery signal file the agent reads on next turn
SIGNAL_FILE="$PROJECT_ROOT/.compact-recovery-${WORKER_NAME}.signal"
cat > "$SIGNAL_FILE" <<SIGNAL
{"worker":"$WORKER_NAME","event":"post_compact","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","action":"run memory_restore and read .compact-breadcrumb-${WORKER_NAME}.json"}
SIGNAL

# Notify coordinator that compaction happened (finding, low severity)
AGENT_INFO=$(curl -s --max-time 2 "$COORDINATOR/workers" 2>/dev/null)
if [ -z "$AGENT_INFO" ]; then
  exit 0
fi

AGENT_ID=$(echo "$AGENT_INFO" | python -c "
import json, sys
try:
    data = json.load(sys.stdin)
    workers = data.get('workers', data.get('agents', []))
    if isinstance(workers, list):
        for w in workers:
            if w.get('name') == '$WORKER_NAME':
                print(w.get('id', ''))
                break
except:
    pass
" 2>/dev/null)

if [ -n "$AGENT_ID" ]; then
  curl -s --max-time 2 -X POST "$COORDINATOR/finding" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"compaction\",\"severity\":\"info\",\"description\":\"$WORKER_NAME context compacted — recovery signal written\"}" >/dev/null 2>&1
fi

exit 0

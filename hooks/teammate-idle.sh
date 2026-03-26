#!/bin/bash
# TeammateIdle hook: Notify coordinator when a spawned subagent goes idle.
#
# Fires when an agent spawned via the Agent tool becomes idle (completes
# its task or has nothing to do). This hook:
#   1. Reports the idle event to the coordinator
#   2. Allows the coordinator to reassign or stop the idle agent
#
# Environment variables from Claude Code:
#   CLAUDE_TEAMMATE_NAME — name of the idle agent
#   CLAUDE_TEAMMATE_ID — session ID of the idle agent
#
# Output JSON with {"continue": false} to signal the idle agent should stop.

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

TEAMMATE="${CLAUDE_TEAMMATE_NAME:-unknown}"
TEAMMATE_SID="${CLAUDE_TEAMMATE_ID:-}"

# Find parent agent's ID
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
  # Report teammate idle as a low-severity finding
  curl -s --max-time 2 -X POST "$COORDINATOR/finding" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"teammate_idle\",\"severity\":\"info\",\"description\":\"Subagent '$TEAMMATE' spawned by $WORKER_NAME is now idle\"}" >/dev/null 2>&1
fi

# Signal the idle subagent to stop (no lingering subagents)
echo '{"continue": false}'

exit 0

#!/bin/bash
# StopFailure hook: Auto-report API errors to the coordinator.
#
# Fires when a Claude session stops due to an API error or unexpected failure.
# Reports the failure as a finding so the coordinator can:
#   - Reassign the task if needed
#   - Track reliability issues
#   - Decide whether to restart the worker
#
# Environment variables from Claude Code:
#   CLAUDE_STOP_REASON — why the session stopped (e.g., "api_error", "rate_limit")
#   CLAUDE_ERROR_MESSAGE — error details (if available)

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

STOP_REASON="${CLAUDE_STOP_REASON:-unknown}"
ERROR_MSG="${CLAUDE_ERROR_MESSAGE:-no details}"

# Find our agentId
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

if [ -z "$AGENT_ID" ]; then
  exit 0
fi

# Sanitize error message for JSON (escape quotes and newlines)
SAFE_MSG=$(echo "$ERROR_MSG" | tr '\n' ' ' | sed 's/"/\\"/g' | head -c 500)

# Report failure as a finding
curl -s --max-time 2 -X POST "$COORDINATOR/finding" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"stop_failure\",\"severity\":\"high\",\"description\":\"$WORKER_NAME stopped: $STOP_REASON — $SAFE_MSG\"}" >/dev/null 2>&1

# Mark any in_progress assignment as failed
ASSIGNMENT=$(curl -s --max-time 2 "$COORDINATOR/assignment?agentId=$AGENT_ID" 2>/dev/null)
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
    curl -s --max-time 2 -X PATCH "$COORDINATOR/assignment/$ASSIGN_ID" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"failed\",\"result\":\"Session stopped: $STOP_REASON\"}" >/dev/null 2>&1
  fi
fi

exit 0

#!/bin/bash
# TaskCompleted hook: Reactive task chaining for the hive.
#
# Fires when Claude Code TaskUpdate sets status=completed.
# This hook:
#   1. Checks if the completed task unblocks any other assignments (blocked_by)
#   2. Reports unblocked assignments as findings for coordinator visibility
#   3. Calls POST /next for the completing agent to chain to the next task
#
# Environment variables from Claude Code:
#   CLAUDE_TASK_ID — internal task ID
#   CLAUDE_TASK_STATUS — task status (we only act on "completed")

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

TASK_STATUS="${CLAUDE_TASK_STATUS:-}"
if [ "$TASK_STATUS" != "completed" ]; then
  exit 0
fi

TASK_ID="${CLAUDE_TASK_ID:-}"

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

# Check if any assignments are blocked by this agent's current assignment
ASSIGNMENTS=$(curl -s --max-time 2 "$COORDINATOR/assignments?status=assigned&limit=50" 2>/dev/null)
if [ -n "$ASSIGNMENTS" ]; then
  # Find assignments whose blocked_by matches the completing agent's assignment
  CURRENT_ASSIGNMENT=$(curl -s --max-time 2 "$COORDINATOR/assignment?agentId=$AGENT_ID" 2>/dev/null)
  CURRENT_ID=$(echo "$CURRENT_ASSIGNMENT" | python -c "
import json, sys
try:
    data = json.load(sys.stdin)
    a = data.get('assignment', data)
    print(a.get('id', ''))
except:
    pass
" 2>/dev/null)

  if [ -n "$CURRENT_ID" ]; then
    UNBLOCKED=$(echo "$ASSIGNMENTS" | python -c "
import json, sys
try:
    data = json.load(sys.stdin)
    assignments = data.get('assignments', data.get('items', []))
    if isinstance(assignments, list):
        for a in assignments:
            blocked = a.get('blocked_by', '')
            if blocked and '$CURRENT_ID' in str(blocked):
                print(a.get('id', '') + '|' + a.get('task', 'unknown')[:100])
except:
    pass
" 2>/dev/null)

    # Report any unblocked assignments
    while IFS='|' read -r UNBLOCKED_ID UNBLOCKED_TASK; do
      if [ -n "$UNBLOCKED_ID" ]; then
        SAFE_TASK=$(echo "$UNBLOCKED_TASK" | tr '\n' ' ' | sed 's/"/\\"/g' | head -c 200)
        curl -s --max-time 2 -X POST "$COORDINATOR/finding" \
          -H "Content-Type: application/json" \
          -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"assignment_unblocked\",\"severity\":\"info\",\"description\":\"$WORKER_NAME completed task, unblocking assignment $UNBLOCKED_ID: $SAFE_TASK\"}" >/dev/null 2>&1
      fi
    done <<< "$UNBLOCKED"
  fi
fi

# Chain to next task: call /next so the completing agent picks up queued work
curl -s --max-time 2 -X POST "$COORDINATOR/next" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$WORKER_NAME\",\"role\":\"worker\",\"workspace\":\"${WORKSPACE:-DEFAULT}\"}" >/dev/null 2>&1

exit 0

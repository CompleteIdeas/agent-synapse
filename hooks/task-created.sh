#!/bin/bash
# TaskCreated hook: Bridge Claude Code internal tasks with AWM coordination.
#
# Fires when a Claude Code task (via TaskCreate tool) is created within
# a session. This hook writes the task info to AWM so other agents can
# see what subtasks are being tracked across the hive.
#
# Environment variables from Claude Code:
#   CLAUDE_TASK_ID — internal task ID
#   CLAUDE_TASK_DESCRIPTION — task description text
#   CLAUDE_TASK_STATUS — initial status

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

TASK_ID="${CLAUDE_TASK_ID:-}"
TASK_DESC="${CLAUDE_TASK_DESCRIPTION:-no description}"
TASK_STATUS="${CLAUDE_TASK_STATUS:-pending}"

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

# Sanitize description for JSON
SAFE_DESC=$(echo "$TASK_DESC" | tr '\n' ' ' | sed 's/"/\\"/g' | head -c 500)

# Report task creation as a finding for coordinator visibility
curl -s --max-time 2 -X POST "$COORDINATOR/finding" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"task_created\",\"severity\":\"info\",\"description\":\"$WORKER_NAME created internal task: $SAFE_DESC (status: $TASK_STATUS)\"}" >/dev/null 2>&1

exit 0

#!/bin/bash
# CwdChanged hook: Log working directory changes to AWM.
#
# Fires when Claude Code changes its working directory.
# Writes the new CWD to AWM so other agents can see where this agent is working.
#
# Install in .claude/settings.json as a CwdChanged hook.

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"
WORKER="${WORKER_NAME:-unknown}"

# Read the new CWD from the tool input (JSON on stdin)
NEW_CWD=""
if [ -t 0 ]; then
  NEW_CWD="$(pwd)"
else
  INPUT=$(cat)
  NEW_CWD=$(echo "$INPUT" | grep -o '"path":"[^"]*"' | head -1 | sed 's/"path":"//;s/"//')
  [ -z "$NEW_CWD" ] && NEW_CWD="$(pwd)"
fi

# Pulse the coordinator so it knows we're alive and where we are
curl -s -X PATCH "$COORDINATOR/pulse" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"${AGENT_ID:-}\"}" > /dev/null 2>&1

exit 0

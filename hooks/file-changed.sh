#!/bin/bash
# FileChanged hook: Reactive AWM writes when key project files change.
#
# Fires when Claude Code detects a file change on disk.
# For agent definition files (.claude/agents/*.md) and settings changes,
# pulses the coordinator so stale detection stays current.
#
# Install in .claude/settings.json as a FileChanged hook.

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"
WORKER="${WORKER_NAME:-unknown}"

# Read file path from hook input
CHANGED_FILE=""
if [ ! -t 0 ]; then
  INPUT=$(cat)
  CHANGED_FILE=$(echo "$INPUT" | grep -o '"path":"[^"]*"' | head -1 | sed 's/"path":"//;s/"//')
fi

[ -z "$CHANGED_FILE" ] && exit 0

# Only react to key files — agent definitions, settings, config
case "$CHANGED_FILE" in
  *.claude/agents/*.md | *.claude/settings*.json | *synapse.config.json | *synapse.workspaces.json)
    # Pulse coordinator to signal activity
    curl -s -X PATCH "$COORDINATOR/pulse" \
      -H "Content-Type: application/json" \
      -d "{\"agentId\":\"${AGENT_ID:-}\"}" > /dev/null 2>&1
    ;;
esac

exit 0

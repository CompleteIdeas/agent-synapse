#!/bin/bash
# SessionEnd / PreCompact hook: Auto-release locks and update assignment status
# Called when a worker's Claude session ends or context is compacted
#
# This prevents the "work done but no record" problem where workers
# complete tasks but crash/compact before running checkout protocol.
#
# Behavior:
#   - Finds the worker's agentId from WORKER_NAME env var
#   - Releases all file locks held by this agent
#   - Marks any in_progress assignment as failed (agent disconnected)
#   - Posts checkout

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

# Need worker name to find our agent
if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

# Find our agentId by name
AGENT_INFO=$(curl -s --max-time 2 "$COORDINATOR/workers" 2>/dev/null)
if [ -z "$AGENT_INFO" ]; then
  exit 0
fi

# Extract agentId for our worker name (simple grep — no jq dependency)
AGENT_ID=$(echo "$AGENT_INFO" | sed -n "/$WORKER_NAME/,/\"id\"/p" | sed -n 's/.*"id"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)

# Try alternate extraction: id comes before name in the JSON
if [ -z "$AGENT_ID" ]; then
  # Get all id/name pairs and find ours
  AGENT_ID=$(echo "$AGENT_INFO" | tr ',' '\n' | tr '{' '\n' | grep -B5 "$WORKER_NAME" | sed -n 's/.*"id"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
fi

if [ -z "$AGENT_ID" ]; then
  exit 0
fi

# Release all locks held by this agent
curl -s --max-time 2 -X POST "$COORDINATOR/checkout" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$AGENT_ID\"}" >/dev/null 2>&1

exit 0

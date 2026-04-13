#!/bin/bash
# PostToolUse hook: Auto-heartbeat to AWM coordinator
# Pulses every 60s (skips if last pulse was recent)
# Uses a temp file to track last pulse time to avoid flooding

PULSE_FILE="/tmp/awm-heartbeat-${WORKER_NAME:-unknown}.last"
AWM_URL="http://127.0.0.1:8400"

# Only workers heartbeat (skip if no WORKER_NAME)
if [ -z "$WORKER_NAME" ]; then
  exit 0
fi

# Check time since last pulse
NOW=$(date +%s)
LAST=0
if [ -f "$PULSE_FILE" ]; then
  LAST=$(cat "$PULSE_FILE" 2>/dev/null || echo 0)
fi

ELAPSED=$((NOW - LAST))

# Pulse every 60 seconds
if [ "$ELAPSED" -lt 60 ]; then
  exit 0
fi

# Save current time
echo "$NOW" > "$PULSE_FILE"

# Get agentId from checkin state file (written by worker on first /next call)
AGENT_ID_FILE="/tmp/awm-agentid-${WORKER_NAME}.txt"
AGENT_ID=""
if [ -f "$AGENT_ID_FILE" ]; then
  AGENT_ID=$(cat "$AGENT_ID_FILE" 2>/dev/null)
fi

if [ -z "$AGENT_ID" ]; then
  # Try to get agentId by looking up worker name
  AGENT_ID=$(curl -s "${AWM_URL}/workers" 2>/dev/null | sed -n "s/.*\"id\":\"\([^\"]*\)\".*\"name\":\"${WORKER_NAME}\".*/\1/p" | head -1)
  if [ -n "$AGENT_ID" ]; then
    echo "$AGENT_ID" > "$AGENT_ID_FILE"
  fi
fi

if [ -z "$AGENT_ID" ]; then
  # Can't find agentId — do a /next call instead (registers + heartbeats)
  curl -s -X POST "${AWM_URL}/next" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${WORKER_NAME}\",\"role\":\"worker\",\"workspace\":\"${WORKSPACE:-WORK}\"}" \
    > /dev/null 2>&1
else
  # Lightweight pulse
  curl -s -X PATCH "${AWM_URL}/pulse" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"${AGENT_ID}\"}" \
    > /dev/null 2>&1
fi

exit 0

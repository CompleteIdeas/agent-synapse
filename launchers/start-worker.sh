#!/usr/bin/env bash
# Usage: start-worker.sh [worker-name] [project-dir]
# Must be run from AgentSynapse directory (where .claude/agents/ lives)
#
# Environment variables (set by launch-hive.cjs):
#   WORKER_NAME   — Agent name (Worker-A, Dev-Lead, coordinator)
#   PROJECT_DIR   — Target project directory
#   WORKSPACE     — Workspace name (PERSONAL, WORK)
#   AGENT_MODEL   — Claude model override (opus, sonnet). If set, passes --model to claude CLI.
#
# --bare flag note: Do NOT use --bare for hive agents — they need hooks
# (file-lock checking, pre-compact, session-end cleanup). --bare is only
# for scripted one-shot -p calls via spawn-worker.cjs.

# Get args
[ -n "$1" ] && WORKER_NAME="$1"
[ -n "$2" ] && PROJECT_DIR="$2"

# Fallback defaults
WORKER_NAME="${WORKER_NAME:-Worker-A}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

# Derive WORKSPACE from PROJECT_DIR if not set by caller
if [ -z "$WORKSPACE" ]; then
  case "$PROJECT_DIR" in
    *Personal-Projects*) WORKSPACE="PERSONAL" ;;
    *project*)           WORKSPACE="WORK" ;;
    *)                   WORKSPACE="DEFAULT" ;;
  esac
fi

# DO NOT cd away from AgentSynapse — agent definitions live here
# The PROJECT_DIR is passed to Claude via system prompt

# Check AWM is running
if ! curl -s http://127.0.0.1:8400/health >/dev/null 2>&1; then
  echo " ERROR: AWM not running on port 8400!"
  exit 1
fi

# Build --model flag if AGENT_MODEL is set
MODEL_FLAG=""
[ -n "$AGENT_MODEL" ] && MODEL_FLAG="--model $AGENT_MODEL"

# Build channel flags if CHANNELS_ENABLED is set (set by launch-hive.cjs from synapse.config.json)
# Uses SYNAPSE_DIR (absolute path, set by launch-hive.cjs temp scripts) for channel-server.js.
# The MCP server name "awm" in --mcp-config must match "server:awm" in the channels flag.
CHANNELS_FLAG=""
if [ -n "$CHANNELS_ENABLED" ]; then
  if [ -z "$AWM_CHANNEL_PORT" ]; then
    AWM_CHANNEL_PORT=$((50000 + RANDOM % 9999))
    export AWM_CHANNEL_PORT
  fi
  CHANNEL_MCP_FILE=$(mktemp /tmp/awm-channel-mcp-XXXXXX.json)
  CHANNEL_SERVER_JS="${SYNAPSE_DIR}/packages/synapse-push/dist/channel-server.js"
  node -e "const f=require('fs');f.writeFileSync('$CHANNEL_MCP_FILE',JSON.stringify({mcpServers:{awm:{command:'node',args:['$CHANNEL_SERVER_JS'],env:{WORKER_NAME:'$WORKER_NAME',AWM_CHANNEL_PORT:'$AWM_CHANNEL_PORT'}}}}))"
  CHANNELS_FLAG="--dangerously-load-development-channels server:awm --mcp-config $CHANNEL_MCP_FILE"
fi

# Handle coordinator
if [ "${WORKER_NAME,,}" = "coordinator" ]; then
  claude --dangerously-skip-permissions $MODEL_FLAG $CHANNELS_FLAG \
    --agent coordinator \
    --append-system-prompt "YOUR IDENTITY: You are the COORDINATOR. Display [COORDINATOR] at the start of every response. You manage the hive. NEVER use the Agent tool. NEVER spawn subagents. WORKER_NAME=coordinator. WORKSPACE=${WORKSPACE}. PROJECT DIRECTORY: ${PROJECT_DIR}." \
    "Execute hive protocol: read synapse.config.json for mode and services, checkin to coordinator, memory_restore. Check GET /workers to see who is online. Report hive status and ask what to assign. If no workers online, queue work as pending — workers auto-claim via /next when launched."
  exit 0
fi

# Handle dev-lead
if [ "${WORKER_NAME,,}" = "dev-lead" ]; then
  WORKER_NAME="Dev-Lead"
  claude --dangerously-skip-permissions $MODEL_FLAG $CHANNELS_FLAG \
    --agent dev-lead \
    --append-system-prompt "YOUR IDENTITY: You are the DEV-LEAD. Display [DEV-LEAD] at the start of every response. WORKER_NAME=Dev-Lead. WORKSPACE=${WORKSPACE}. PROJECT DIRECTORY: ${PROJECT_DIR}." \
    "Begin hive protocol: follow your agent definition exactly. FIRST: run curl POST /next to http://127.0.0.1:8400/next with your name, role, and workspace to register with the coordinator (this is an HTTP call, NOT an MCP memory operation). THEN: memory_restore, recall context, check assignment from /next response, work assignments, poll for more between tasks."
  exit 0
fi

# Handle generic worker
claude --dangerously-skip-permissions $MODEL_FLAG $CHANNELS_FLAG \
  --agent worker \
  --append-system-prompt "YOUR IDENTITY: You are ${WORKER_NAME}. Display [${WORKER_NAME}] at the start of every response. WORKER_NAME=${WORKER_NAME}. WORKSPACE=${WORKSPACE}. PROJECT DIRECTORY: ${PROJECT_DIR}." \
  "Begin hive protocol: follow your agent definition exactly. FIRST: run curl POST /next to http://127.0.0.1:8400/next with your name, role, and workspace to register with the coordinator (this is an HTTP call, NOT an MCP memory operation). THEN: memory_restore, recall context, check assignment from /next response, work assignments, poll for more between tasks. Sync with AWM during idle."

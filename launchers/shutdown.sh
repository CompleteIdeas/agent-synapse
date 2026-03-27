#!/usr/bin/env bash
# Graceful shutdown: broadcast SHUTDOWN to agents, wait for idle, then stop services
# Usage: shutdown.sh [workspace] [--now]
#   shutdown.sh              — global shutdown (all workspaces + kill coordinator)
#   shutdown.sh equihub      — shutdown equihub agents only (coordinator stays running)
#   shutdown.sh --now        — global shutdown, skip wait
#   shutdown.sh equihub --now

echo
echo " AgentSynapse Graceful Shutdown"
echo " =============================="
echo

# Parse args
WS_ARG=""
SKIP_WAIT=0
for arg in "$@"; do
  if [ "$arg" = "--now" ]; then
    SKIP_WAIT=1
  else
    WS_ARG="$arg"
  fi
done

# Check if coordinator is running
if ! curl -s --max-time 2 http://127.0.0.1:8400/health >/dev/null 2>&1; then
  echo " Coordinator not running — nothing to shut down."
  echo
  exit 0
fi

# Build workspace JSON / query params
if [ -n "$WS_ARG" ]; then
  WS_JSON=",\"workspace\":\"$WS_ARG\""
  WS_QUERY="?workspace=$WS_ARG"
  echo " Workspace: $WS_ARG (agents only — coordinator stays running)"
else
  WS_JSON=""
  WS_QUERY=""
  echo " Scope: ALL workspaces + coordinator"
fi
echo

# Step 1: Show current hive status
echo " Current hive status:"
curl -s http://127.0.0.1:8400/status 2>/dev/null
echo
echo

# Step 2: Broadcast SHUTDOWN command
echo " Broadcasting SHUTDOWN..."
if curl -s -X POST http://127.0.0.1:8400/command \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"SHUTDOWN\",\"reason\":\"graceful shutdown via launcher\",\"issuedBy\":\"cli\"$WS_JSON}" >/dev/null 2>&1; then
  echo "   SHUTDOWN broadcast sent."
else
  echo "   WARNING: Failed to broadcast SHUTDOWN."
fi
echo

# Step 3: Skip wait if --now
if [ "$SKIP_WAIT" = "1" ]; then
  echo " --now flag: skipping wait."
else
  # Step 4: Wait for agents to go idle (up to 60 seconds)
  echo " Waiting for agents to finish up (up to 60s)..."
  TRIES=0
  while [ $TRIES -lt 20 ]; do
    sleep 3
    TRIES=$((TRIES + 1))
    RESULT=$(curl -s --max-time 2 "http://127.0.0.1:8400/command/wait$WS_QUERY" 2>/dev/null)
    if echo "$RESULT" | grep -q '"allReady":true'; then
      echo "   All agents idle — safe to stop."
      break
    fi
    echo "   Still waiting... ($TRIES/20)"
  done
  if [ $TRIES -ge 20 ]; then
    echo "   Timeout — proceeding with stop."
  fi
fi

# If workspace-scoped, don't kill coordinator
if [ -n "$WS_ARG" ]; then
  echo
  echo " Workspace $WS_ARG agents shut down. Coordinator still running."
  echo
  exit 0
fi

echo
echo " Stopping coordinator..."

# Kill processes on known ports
for PORT in 8400 8420; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      if kill -9 "$PID" 2>/dev/null; then
        echo "   Stopped process on port $PORT (PID $PID)"
      fi
    done
  fi
done

echo
echo " Shutdown complete."
echo

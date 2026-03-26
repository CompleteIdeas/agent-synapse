#!/bin/bash
# WorktreeRemove hook: Auto-deregister worktree agents from the coordinator.
#
# Fires when a Claude Code worktree is cleaned up. Checks out the
# worktree agent so it's removed from the active worker list.
#
# Environment variables from Claude Code:
#   CLAUDE_WORKTREE_PATH — path to the removed worktree
#   CLAUDE_AGENT_NAME — name of the agent that owned the worktree

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-}"
PARENT_AGENT="${CLAUDE_AGENT_NAME:-${WORKER_NAME:-unknown}}"

if [ -z "$WORKTREE_PATH" ]; then
  exit 0
fi

# Derive the same worktree worker name used in worktree-create.sh
WT_NAME="${PARENT_AGENT}-wt-$(basename "$WORKTREE_PATH" | head -c 20)"

# Find the worktree agent's ID and check it out
AGENT_INFO=$(curl -s --max-time 2 "$COORDINATOR/workers" 2>/dev/null)
if [ -z "$AGENT_INFO" ]; then
  exit 0
fi

WT_AGENT_ID=$(echo "$AGENT_INFO" | python -c "
import json, sys
try:
    data = json.load(sys.stdin)
    workers = data.get('workers', data.get('agents', []))
    if isinstance(workers, list):
        for w in workers:
            if w.get('name') == '$WT_NAME':
                print(w.get('id', ''))
                break
except:
    pass
" 2>/dev/null)

if [ -n "$WT_AGENT_ID" ]; then
  # Check out the worktree agent (releases locks, marks dead)
  curl -s --max-time 2 -X POST "$COORDINATOR/checkout" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"$WT_AGENT_ID\"}" >/dev/null 2>&1
fi

exit 0

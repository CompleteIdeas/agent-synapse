#!/bin/bash
# WorktreeCreate hook: Auto-register worktree agents with the coordinator.
#
# Fires when a Claude Code agent creates a git worktree (isolation: "worktree").
# Registers the new worktree agent with the coordinator so it's visible
# in the hive and can receive assignments.
#
# Environment variables from Claude Code:
#   CLAUDE_WORKTREE_PATH — path to the new worktree
#   CLAUDE_WORKTREE_BRANCH — branch name in the worktree
#   CLAUDE_AGENT_NAME — name of the agent that created the worktree

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

WORKTREE_PATH="${CLAUDE_WORKTREE_PATH:-}"
WORKTREE_BRANCH="${CLAUDE_WORKTREE_BRANCH:-}"
PARENT_AGENT="${CLAUDE_AGENT_NAME:-${WORKER_NAME:-unknown}}"

if [ -z "$WORKTREE_PATH" ]; then
  exit 0
fi

# Derive a worktree worker name from the branch or path
WT_NAME="${PARENT_AGENT}-wt-$(basename "$WORKTREE_PATH" | head -c 20)"

# Register the worktree agent with the coordinator
curl -s --max-time 2 -X POST "$COORDINATOR/checkin" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$WT_NAME\",\"role\":\"worker\",\"capabilities\":[\"code\",\"worktree\"],\"metadata\":{\"parent\":\"$PARENT_AGENT\",\"worktree_path\":\"$WORKTREE_PATH\",\"branch\":\"$WORKTREE_BRANCH\"}}" >/dev/null 2>&1

# Report as a finding for coordinator awareness
AGENT_INFO=$(curl -s --max-time 2 "$COORDINATOR/workers" 2>/dev/null)
AGENT_ID=$(echo "$AGENT_INFO" | python -c "
import json, sys
try:
    data = json.load(sys.stdin)
    workers = data.get('workers', data.get('agents', []))
    if isinstance(workers, list):
        for w in workers:
            if w.get('name') == '$PARENT_AGENT':
                print(w.get('id', ''))
                break
except:
    pass
" 2>/dev/null)

if [ -n "$AGENT_ID" ]; then
  curl -s --max-time 2 -X POST "$COORDINATOR/finding" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"$AGENT_ID\",\"category\":\"worktree\",\"severity\":\"info\",\"description\":\"Worktree created: $WT_NAME at $WORKTREE_PATH (branch: $WORKTREE_BRANCH)\"}" >/dev/null 2>&1
fi

exit 0

#!/bin/bash
# PreCompact hook: Auto-save critical state before context compaction fires.
#
# Fires for ALL agent roles (coordinator, workers, dev-lead).
# Ensures state is persisted BEFORE the LLM's context gets summarized,
# so post-compaction recovery has something reliable to read.
#
# Coordinator: writes coordinator_state.json with current timestamp
# Workers: writes a breadcrumb file with assignment context
#
# Install in .claude/settings.json as a PreCompact hook.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

# --- Coordinator: update state file timestamp ---
if [ "$WORKER_NAME" = "coordinator" ]; then
  STATE_FILE="$PROJECT_ROOT/coordinator_state.json"
  if [ -f "$STATE_FILE" ]; then
    # Update last_tick_at to now so post-compaction recovery knows state is fresh
    NOW=$(python -c "from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat())" 2>/dev/null)
    if [ -n "$NOW" ]; then
      # Use python for reliable JSON update (sed on Windows Git Bash is fragile)
      python -c "
import json, sys
try:
    with open('$STATE_FILE', 'r') as f:
        state = json.load(f)
    state['last_tick_at'] = '$NOW'
    state['pre_compact_save'] = True
    with open('$STATE_FILE', 'w') as f:
        json.dump(state, f, indent=2)
except Exception as e:
    print(f'pre-compact: state save failed: {e}', file=sys.stderr)
" 2>/dev/null
    fi
  fi
  exit 0
fi

# --- Workers / Dev-Lead: save assignment breadcrumb ---
if [ -n "$WORKER_NAME" ]; then
  # Query coordinator for our current assignment
  AGENT_INFO=$(curl -s --max-time 2 "$COORDINATOR/workers" 2>/dev/null)
  if [ -z "$AGENT_INFO" ]; then
    exit 0
  fi

  # Find our agentId
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

  # Get current assignment
  ASSIGNMENT=$(curl -s --max-time 2 "$COORDINATOR/assignment?agentId=$AGENT_ID" 2>/dev/null)
  if [ -n "$ASSIGNMENT" ]; then
    # Write breadcrumb file that the worker can read post-compaction
    BREADCRUMB="$PROJECT_ROOT/.compact-breadcrumb-${WORKER_NAME}.json"
    NOW=$(python -c "from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat())" 2>/dev/null)
    python -c "
import json, sys
try:
    assignment = json.loads('''$ASSIGNMENT''')
    breadcrumb = {
        'worker': '$WORKER_NAME',
        'agent_id': '$AGENT_ID',
        'saved_at': '$NOW',
        'reason': 'pre-compact auto-save',
        'assignment': assignment
    }
    with open('$BREADCRUMB', 'w') as f:
        json.dump(breadcrumb, f, indent=2)
except Exception as e:
    print(f'pre-compact: breadcrumb save failed: {e}', file=sys.stderr)
" 2>/dev/null
  fi

  # Get locked files
  LOCKS=$(curl -s --max-time 2 "$COORDINATOR/locks" 2>/dev/null)
  if [ -n "$LOCKS" ]; then
    BREADCRUMB="$PROJECT_ROOT/.compact-breadcrumb-${WORKER_NAME}.json"
    python -c "
import json, sys
try:
    locks = json.loads('''$LOCKS''')
    breadcrumb_path = '$BREADCRUMB'
    try:
        with open(breadcrumb_path, 'r') as f:
            breadcrumb = json.load(f)
    except:
        breadcrumb = {'worker': '$WORKER_NAME'}
    my_locks = [l.get('file_path','') for l in locks.get('locks',[]) if l.get('locked_by','') == '$WORKER_NAME' or l.get('agent_id','') == '$AGENT_ID']
    breadcrumb['locked_files'] = my_locks
    with open(breadcrumb_path, 'w') as f:
        json.dump(breadcrumb, f, indent=2)
except Exception as e:
    print(f'pre-compact: lock save failed: {e}', file=sys.stderr)
" 2>/dev/null
  fi
fi

exit 0

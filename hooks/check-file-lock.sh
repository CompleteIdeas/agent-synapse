#!/bin/bash
# PreToolUse hook: Block Edit/Write on files locked by another agent
# Queries AWM coordination API (port 8400) for file locks
#
# Behavior:
#   - If no locks exist on the file → allow (exit 0)
#   - If the file is locked by the SAME agent → allow (exit 0)
#   - If the file is locked by a DIFFERENT agent → deny with message
#   - If AWM is not running → allow (single-agent mode)

COORDINATOR="${COORD_URL:-http://127.0.0.1:8400}"

INPUT=$(cat)

# Extract file_path from tool input JSON
FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)

# No file path → not our concern
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize: backslashes to forward slashes, strip drive prefix for relative comparison
NORMALIZED=$(echo "$FILE_PATH" | sed 's|\\|/|g')

# Query AWM coordination API for locks
LOCKS_JSON=$(curl -s --max-time 2 "$COORDINATOR/locks" 2>/dev/null)
if [ -z "$LOCKS_JSON" ] || [ "$LOCKS_JSON" = "" ]; then
  # AWM not running or no response → allow (single-agent mode)
  exit 0
fi

# Check if any lock matches our file (using python for reliable JSON parsing)
RESULT=$(python -c "
import json, sys, os
try:
    data = json.loads('''$LOCKS_JSON''')
    locks = data.get('locks', [])
    if not locks:
        sys.exit(0)

    # Normalize the target path
    target = '$NORMALIZED'.replace('\\\\', '/').lower()
    # Also try just the filename and relative portions
    target_parts = target.split('/')

    worker = os.environ.get('WORKER_NAME', '')

    for lock in locks:
        lp = lock.get('file_path', '').replace('\\\\', '/').lower()
        # Match if paths end the same way or are equal
        if target.endswith(lp) or lp.endswith(target) or target == lp:
            agent_name = lock.get('agent_name', lock.get('agent_id', 'unknown'))
            if worker and agent_name == worker:
                # We hold this lock — allow
                print('SELF')
                sys.exit(0)
            reason = lock.get('reason', 'no reason given')
            print(f'LOCKED|{agent_name}|{reason}')
            sys.exit(0)
    # No matching lock
    print('NONE')
except Exception as e:
    print(f'ERROR|{e}', file=sys.stderr)
    print('NONE')
" 2>/dev/null)

case "$RESULT" in
  NONE|SELF|"")
    exit 0
    ;;
  LOCKED*)
    LOCKED_BY=$(echo "$RESULT" | cut -d'|' -f2)
    LOCK_REASON=$(echo "$RESULT" | cut -d'|' -f3)
    cat <<ENDJSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "FILE LOCKED: '$FILE_PATH' is locked by '$LOCKED_BY' ($LOCK_REASON). Wait for them to finish, or release via: DELETE /lock on port 8400."
  }
}
ENDJSON
    exit 0
    ;;
esac

exit 0

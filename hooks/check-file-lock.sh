#!/bin/bash
# PreToolUse hook: Block Edit/Write on files locked by another agent
# Uses coordination.db file_locks table
#
# Behavior:
#   - If no locks exist on the file → allow (exit 0)
#   - If the file is locked by the SAME agent → allow (exit 0)
#   - If the file is locked by a DIFFERENT agent → deny with message
#   - If coordination.db doesn't exist → allow (single-agent mode)

INPUT=$(cat)

# Extract file_path and agent_type from tool input JSON
# Uses sed — works on Windows Git Bash without jq or grep -P
FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
AGENT_TYPE=$(echo "$INPUT" | sed -n 's/.*"agent_type"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)

# No file path → not our concern
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Resolve DB path — look for coordination.db in project root
# The hook is at <project>/.claude/hooks/check-file-lock.sh
# The DB is at <project>/coordination.db (created by the coordinator service)
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="$SCRIPT_DIR/coordination.db"

# Also check if coordinator stores it elsewhere
if [ ! -f "$DB" ]; then
  # Try the project root (two levels up from hooks/)
  PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  DB="$PROJECT_ROOT/coordination.db"
fi

# No coordination DB → single-agent mode, allow everything
if [ ! -f "$DB" ]; then
  exit 0
fi

# Check if sqlite3 is available
if ! command -v sqlite3 &>/dev/null; then
  exit 0
fi

# Normalize file path: convert backslashes to forward slashes
NORMALIZED_PATH=$(echo "$FILE_PATH" | sed 's|\\|/|g')

# Try to make it relative to the project root
# Strip common absolute path prefixes to get a relative path
REL_PATH="$NORMALIZED_PATH"
# Strip Windows-style absolute path (C:/Users/.../project-name/)
REL_PATH=$(echo "$REL_PATH" | sed 's|^[A-Za-z]:/[^/]*/[^/]*/[^/]*/[^/]*/||')
# Strip POSIX-style absolute path (/c/Users/.../project-name/)
REL_PATH=$(echo "$REL_PATH" | sed 's|^/[a-z]/[^/]*/[^/]*/[^/]*/[^/]*/||')
# Strip any leading slash
REL_PATH=$(echo "$REL_PATH" | sed 's|^/||')

# Check for locks on this file (try both absolute and relative paths)
LOCK_INFO=$(sqlite3 "$DB" "SELECT locked_by, task_id, reason FROM file_locks WHERE file_path = '$REL_PATH' OR file_path = '$NORMALIZED_PATH' OR file_path = '$FILE_PATH' LIMIT 1;" 2>/dev/null)

# No lock → allow
if [ -z "$LOCK_INFO" ]; then
  exit 0
fi

# Parse lock info (sqlite3 returns pipe-separated by default)
LOCKED_BY=$(echo "$LOCK_INFO" | cut -d'|' -f1)
LOCK_TASK=$(echo "$LOCK_INFO" | cut -d'|' -f2)
LOCK_REASON=$(echo "$LOCK_INFO" | cut -d'|' -f3)

# If we know our agent type, check if WE hold the lock
if [ -n "$AGENT_TYPE" ]; then
  if [ "$AGENT_TYPE" = "$LOCKED_BY" ]; then
    exit 0
  fi
fi

# Check WORKER_NAME env var (set by launcher)
if [ -n "$WORKER_NAME" ]; then
  if [ "$WORKER_NAME" = "$LOCKED_BY" ]; then
    exit 0
  fi
fi

# Check if there are ANY active agents (if no agents checked in recently, locks may be stale)
ACTIVE_AGENTS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM agents WHERE last_seen > datetime('now', '-10 minutes');" 2>/dev/null)
if [ "$ACTIVE_AGENTS" = "0" ] || [ -z "$ACTIVE_AGENTS" ]; then
  # No recently active agents → locks are stale, allow the edit
  exit 0
fi

# File is locked by someone else — deny
cat <<ENDJSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "FILE LOCKED: '$REL_PATH' is locked by agent '$LOCKED_BY' (task #$LOCK_TASK: $LOCK_REASON). Either wait for them to finish, or release the lock via the coordinator API: DELETE /lock"
  }
}
ENDJSON
exit 0

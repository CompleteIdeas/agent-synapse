#!/bin/bash
# AgentSynapse Skills Setup
# Installs core skills that agents need for multi-agent orchestration.
#
# Usage:
#   ./setup-skills.sh              # Install to this project only
#   ./setup-skills.sh --global     # Install globally (~/.claude/skills/)
#
# Skills included:
#   - ask-coworker: Query another LLM for a second opinion when stuck

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_SRC="$SCRIPT_DIR/.claude/skills"

# Determine target
if [ "$1" = "--global" ]; then
  TARGET="$HOME/.claude/skills"
  SCOPE="global (all projects)"
else
  # Install to the project that's using AgentSynapse
  # If running from within AgentSynapse itself, install locally
  TARGET="$SCRIPT_DIR/.claude/skills"
  SCOPE="project ($SCRIPT_DIR)"
fi

echo "AgentSynapse Skills Setup"
echo "========================="
echo "Scope: $SCOPE"
echo "Target: $TARGET"
echo ""

# Create target if needed
mkdir -p "$TARGET"

# List of skills to install
SKILLS=("ask-coworker")

for SKILL in "${SKILLS[@]}"; do
  SRC="$SKILLS_SRC/$SKILL"
  DEST="$TARGET/$SKILL"

  if [ ! -d "$SRC" ]; then
    echo "SKIP: $SKILL (source not found at $SRC)"
    continue
  fi

  if [ -d "$DEST" ] || [ -L "$DEST" ]; then
    echo "EXISTS: $SKILL (already at $DEST)"
    continue
  fi

  # On Windows, use directory junction (no admin needed)
  # On Unix, use symlink
  if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ -n "$WINDIR" ]]; then
    # Convert to Windows paths for cmd /c mklink
    WIN_SRC=$(cygpath -w "$SRC" 2>/dev/null || echo "$SRC" | sed 's|/|\\|g')
    WIN_DEST=$(cygpath -w "$DEST" 2>/dev/null || echo "$DEST" | sed 's|/|\\|g')
    cmd //c "mklink /J \"$WIN_DEST\" \"$WIN_SRC\"" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
      echo "LINKED: $SKILL → $SRC (junction)"
    else
      # Fallback to copy
      cp -r "$SRC" "$DEST"
      echo "COPIED: $SKILL → $DEST"
    fi
  else
    ln -s "$SRC" "$DEST"
    echo "LINKED: $SKILL → $SRC (symlink)"
  fi
done

echo ""
echo "Done. Skills are available to Claude Code agents in this project."
echo ""
echo "To install globally (all projects): ./setup-skills.sh --global"
echo "To verify: ls $TARGET/"

# AgentSynapse

> **Preview** — This project is in active development with known bugs. It works well for our workflows but isn't production-ready for general use yet. Feedback, issues, and ideas are welcome. If you're looking for the stable memory system (works standalone without AgentSynapse), see [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory).

**Multi-agent coordination with persistent memory for Claude Code.**

AgentSynapse is a framework for running multiple Claude Code agents in parallel — with shared memory, coordinated task assignment, file locking, and autonomous coordination. It combines two core systems:

- **AWM** ([AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory)) — Cognitive memory layer with activation-based retrieval, salience filtering, Hebbian learning. Agents remember across sessions. Also serves as the coordination backend when `AWM_COORDINATION=true`.
- **Coordination** — Built into AWM. Task dispatch, file locks, heartbeats, worker discovery, and command broadcasting. All on port 8400.

```
                    ┌──────────────────────────────┐
┌──────────────┐    │  AWM + Coordination (8400)   │    ┌──────────────┐
│  Coordinator │◄──►│                              │◄──►│  Worker-A    │
│  (agent)     │    │  Memory: MCP tools per agent │    │              │
└──────────────┘    │  Coord: HTTP REST API        │    └──────────────┘
                    │                              │    ┌──────────────┐
                    │                              │◄──►│  Worker-B    │
                    └──────────────────────────────┘    └──────────────┘
```

## How It Works

1. **Start the services** — AWM with coordination enabled (port 8400)
2. **Launch workers** — Each worker is a separate Claude Code session in its own terminal
3. **Launch the coordinator** — Reads your task database, discovers workers, assigns work
4. **Workers adapt** — Generic workers (Worker-A, B, C) take on whatever role the task needs
5. **Memory persists** — Agents write discoveries to shared memory; future sessions recall them
6. **File locks prevent collisions** — A PreToolUse hook blocks edits on files locked by another agent

## Prerequisites

- **Node.js >= 20** — `node -v` to check
- **Git** — for submodules
- **Claude CLI** (`claude`) — [Install Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- **Windows Terminal** (recommended) — for tabbed agent windows. Falls back to separate cmd windows if not installed.
- **Python 3** — used by some hooks for JSON parsing

## Quick Start

```bash
# 1. Clone + pull AWM submodule
git clone https://github.com/CompleteIdeas/agent-synapse.git
cd agent-synapse
git submodule update --init

# 2. Install all dependencies (including AWM via npm workspaces)
npm install

# 3. Configure workspaces — edit paths for your machine
cp synapse.workspaces.example.json synapse.workspaces.json
# Edit synapse.workspaces.json: set projectDir to your project path

# 4. Launch everything (AWM + coordination + agents) in Windows Terminal
./launchers/start-all.bat

# Or launch step by step:
./launchers/start-services.bat                    # Start AWM + coordination
./launchers/start-worker.bat coordinator           # Tab 1: Coordinator
./launchers/start-worker.bat Worker-A              # Tab 2: Worker
./launchers/start-worker.bat Worker-B              # Tab 3: Worker
```

## Project Structure

```
agent-synapse/
├── packages/
│   ├── awm/                 # Git submodule → AgentWorkingMemory
│   │   ├── src/             # Memory + coordination (activation, salience, MCP)
│   │   └── ...              # See github.com/CompleteIdeas/agent-working-memory
│   ├── coordinator/         # Legacy coordinator (deprecated — use AWM coordination)
│   ├── task-manager/        # Sprint/task tracker service (port 8420, optional)
│   └── memory-client/       # Thin HTTP client for AWM (programmatic access)
├── agents/                  # Claude Code agent definitions
│   ├── worker.md            # Generic worker — adapts role per task
│   └── coordinator.md       # Autonomous coordinator — manages the hive
├── hooks/                   # Claude Code hooks
│   ├── check-file-lock.sh   # PreToolUse: blocks edits on locked files
│   ├── coordinator-watchdog.sh  # Notification: detects stalled coordinator loop
│   ├── pre-compact.sh       # PreCompact: saves state before context compaction
│   └── worker-cleanup.sh    # SessionEnd: releases locks on exit
├── launchers/               # Start scripts (Windows)
│   ├── start-all.bat        # Launch AWM + coordinator + workers
│   ├── start-worker.bat     # Launch a single agent
│   ├── launch-hive.cjs      # Programmatic hive launcher
│   └── spawn-worker.cjs     # On-demand worker spawner
├── bin/synapse.js           # CLI: npx agent-synapse <command>
└── examples/                # Example configurations
```

## Core Concepts

### Memory (AWM)

The memory layer uses cognitive science concepts:

- **Activation decay** — Memories fade over time (ACT-R power law)
- **Salience filtering** — Not everything is worth remembering
- **Hebbian learning** — Memories recalled together strengthen connections
- **Staging buffer** — New memories are staged before becoming permanent
- **Consolidation** — Periodic merging of related memories
- **Retraction** — Correct wrong information without losing history

Agents interact via MCP tools: `memory_write`, `memory_recall`, `memory_restore`, `memory_checkpoint`, `memory_feedback`, `memory_retract`, `memory_task_begin`, `memory_task_end`.

### Coordinator

Real-time coordination via REST API:

| Endpoint | Purpose |
|----------|---------|
| `POST /checkin` | Agent registers/heartbeats |
| `POST /checkout` | Agent signs off |
| `GET /workers` | List available workers (filter by status) |
| `POST /assign` | Create a task (workers claim it) |
| `GET /assignment` | Worker checks for assigned work |
| `POST /assignment/:id/claim` | Worker claims a pending task |
| `PATCH /assignment/:id` | Update assignment status |
| `POST /lock` | Lock a file for editing |
| `DELETE /lock` | Release a file lock |
| `POST /command` | Broadcast command (BUILD_FREEZE, PAUSE, RESUME, SHUTDOWN) |
| `GET /status` | Full dashboard (agents, assignments, locks) |
| `GET /stale` | Detect agents that stopped heartbeating |

### Workers

Workers are generic. A single `worker.md` agent definition handles:

- Coding, building, implementing
- Code review and auditing
- Documentation writing
- Bug fixing and debugging
- Testing and validation
- Refactoring and migration

The task description tells the worker what role to play. Worker-A might code one task and review the next.

### Coordinator

The coordinator runs autonomously:

1. Checks in, discovers workers via `GET /workers`
2. Pulls tasks from a task database or sprint plans
3. Assigns work to idle workers
4. Monitors progress every 3 minutes
5. Detects new workers joining and assigns them immediately
6. Scans live sites for health issues
7. Reports significant events to the user
8. Never stops until SHUTDOWN

### File Lock Hook

A `PreToolUse` hook that fires on every `Edit` and `Write` call:

- Checks `coordination.db` for active locks on the target file
- Blocks edits if the file is locked by a different agent
- Allows edits if you hold the lock yourself
- Auto-allows if locks are stale (agent inactive >10 minutes)
- No-op in single-agent mode (no coordination DB = no locks)

## Integration with Your Project

To use AgentSynapse in your own project:

1. **Install and start the services** (AWM with coordination enabled)
2. **Copy `agents/` into your `.claude/agents/`** — customize task descriptions for your domain
3. **Copy `hooks/check-file-lock.sh` into your `.claude/hooks/`** — add to `.claude/settings.json`
4. **Configure MCP** in your Claude Code settings to connect to the memory server
5. **Customize launchers** for your project paths

## License

MIT

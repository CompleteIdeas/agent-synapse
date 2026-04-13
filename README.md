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

# 4. Run setup (registers plugin marketplace + installs AWM channel plugin)
./setup.bat

# 5. Launch everything (AWM + coordination + agents) in Windows Terminal
./launchers/start-all-work.bat      # Work workspace (5 agents)
./launchers/start-all-personal.bat  # Personal workspace (4 agents)

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
│   ├── synapse-push/        # Channel server — pushes assignments to idle workers
│   │   └── dist/channel-server.js  # MCP server with claude/channel capability
│   ├── coordinator/         # Legacy coordinator (deprecated — use AWM coordination)
│   ├── task-manager/        # Sprint/task tracker (legacy — now consolidated into AWM on port 8400)
│   └── memory-client/       # Thin HTTP client for AWM (programmatic access)
├── marketplace/             # Local Claude Code plugin marketplace
│   ├── .claude-plugin/marketplace.json  # Marketplace manifest
│   └── plugins/awm/         # AWM channel plugin (references synapse-push)
├── .claude/agents/          # Claude Code agent definitions
│   ├── worker.md            # Generic worker — adapts role per task
│   ├── dev-lead.md          # Dev-lead — scoping, architecture, task breakdown
│   └── coordinator.md       # Autonomous coordinator — manages the hive
├── hooks/                   # Claude Code hooks
│   ├── check-file-lock.sh   # PreToolUse: blocks edits on locked files
│   ├── coordinator-watchdog.sh  # Notification: detects stalled coordinator loop
│   ├── pre-compact.sh       # PreCompact: saves state before context compaction
│   └── worker-cleanup.sh    # SessionEnd: releases locks on exit
├── launchers/               # Start scripts (Windows + Unix)
│   ├── start-all-work.bat   # Launch work workspace hive
│   ├── start-all-personal.bat  # Launch personal workspace hive
│   ├── start-worker.bat     # Launch a single agent
│   ├── launch-hive.cjs      # Programmatic hive launcher (reads synapse.workspaces.json)
│   └── spawn-worker.cjs     # On-demand worker spawner
├── setup.bat                # One-click setup (marketplace + plugin install)
├── synapse.config.json      # Service discovery, models, channels, loop timers
├── synapse.workspaces.json  # Per-user workspace paths (gitignored)
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
| **`POST /next`** | **Combined checkin + command check + assignment poll (preferred)** |
| `POST /checkin` | Agent registers/heartbeats (use `/next` instead for polling) |
| `POST /checkout` | Agent signs off |
| `GET /workers` | List available workers (filter by status) |
| `POST /assign` | Create a task (workers claim it) |
| `GET /assignment` | Worker checks for assigned work (supports `?name=X&workspace=Y` fallback) |
| `POST /assignment/:id/claim` | Worker claims a pending task |
| `PATCH /assignment/:id` | Update assignment status |
| `POST /lock` | Lock a file for editing |
| `DELETE /lock` | Release a file lock |
| `POST /command` | Broadcast command (BUILD_FREEZE, PAUSE, RESUME, SHUTDOWN) |
| `GET /status` | Full dashboard (agents, assignments, locks) |
| `PATCH /pulse` | Lightweight heartbeat (no event row) |
| `GET /stale` | Detect agents that stopped heartbeating |

### Workers

Workers are generic and idle at the prompt until woken by channel push. A single `worker.md` agent definition handles:

- Coding, building, implementing
- Code review and auditing
- Documentation writing
- Bug fixing and debugging
- Testing and validation
- Refactoring and migration

The task description tells the worker what role to play. Worker-A might code one task and review the next. Workers never exit — sessions run 4-8 hours. A 15-minute heartbeat keeps them registered as a fallback.

### Coordinator

The coordinator runs autonomously and dispatches work via channel push:

1. Checks in, discovers workers via `GET /workers`
2. Pulls tasks from a task database, sprint plans, or user instructions
3. Assigns work with `POST /assign` using `worker_name` field — synapse-push automatically delivers a `← awm:` notification to wake the worker
4. Monitors progress via 5-minute fallback tick and `← awm:` completion notifications
5. Detects new workers joining and assigns them immediately
6. Reports significant events to the user
7. Never stops until SHUTDOWN

**Assignment flow:**
```bash
# Coordinator assigns — synapse-push auto-pushes to worker's channel
curl -s -X POST http://127.0.0.1:8400/assign \
  -H "Content-Type: application/json" \
  -d '{"worker_name":"Worker-A","task":"Implement feature X","workspace":"WORK"}'
# → Worker-A receives ← awm: notification, wakes up, starts working
```

**Critical:** Use `worker_name` field — NOT `agentName`, `agent_name`, or `agent_id`. Wrong field names are silently stripped, causing assignments to go undelivered.

### Push Channels

Workers need to be woken up when assignments arrive. Without channels, idle workers sit at the Claude Code prompt forever. AgentSynapse solves this with a **push channel** — an MCP server that pushes assignment notifications directly into idle Claude Code sessions.

**How it works:**

1. Each worker launches with `--channels plugin:awm@agentsynapse`
2. Claude Code spawns the AWM channel server (MCP with `claude/channel` capability)
3. The channel server listens on an HTTP port for `POST /push` from the coordinator
4. When the coordinator assigns work, synapse-push sends a notification
5. The notification arrives in Claude Code as `<channel source="awm">` — waking the worker

**Setup (one-time per machine):**

```bash
# Run setup.bat — registers the local marketplace and installs the AWM channel plugin
./setup.bat

# What it does:
#   1. claude plugin marketplace add ./marketplace  — registers "agentsynapse" marketplace
#   2. claude plugin install awm@agentsynapse       — installs the channel plugin
```

**Why a plugin?** Claude Code requires `--dangerously-load-development-channels` for raw `server:` entries, which shows an interactive confirmation prompt — impossible for automated launches. Packaging as a plugin and using `--channels plugin:awm@agentsynapse` bypasses this prompt entirely.

**Idle behavior:** Agents stay at the prompt waiting for `← awm:` push notifications. A lightweight heartbeat every 15 minutes keeps them registered as a fallback. Agents never exit — sessions run 4-8 hours.

**Admin requirement (Claude Team/Enterprise):** An org admin must add the plugin to the approved channels allowlist in managed settings at [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code):

```json
{
  "channelsEnabled": true,
  "allowedChannelPlugins": [
    { "marketplace": "agentsynapse", "plugin": "awm" }
  ]
}
```

Without this, Claude Code receives push notifications but silently drops them.

### File Lock Hook

A `PreToolUse` hook that fires on every `Edit` and `Write` call:

- Checks AWM coordination API for active locks on the target file
- Blocks edits if the file is locked by a different agent
- Allows edits if you hold the lock yourself
- Auto-allows if locks are stale (agent inactive >10 minutes)
- No-op in single-agent mode (no coordination service = no locks)

## Integration with Your Project

To use AgentSynapse in your own project:

1. **Clone and install**
   ```bash
   git clone https://github.com/CompleteIdeas/agent-synapse.git
   cd agent-synapse
   git submodule update --init
   npm install
   ```

2. **Configure workspaces** — copy and edit `synapse.workspaces.example.json` to `synapse.workspaces.json` with your project paths

3. **Run setup** — registers marketplace and installs the AWM channel plugin
   ```bash
   ./setup.bat
   ```

4. **Configure Claude Team admin settings** — required for channel push to work
   - Go to [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code)
   - Add to managed settings:
     ```json
     {
       "channelsEnabled": true,
       "allowedChannelPlugins": [
         { "marketplace": "agentsynapse", "plugin": "awm" }
       ]
     }
     ```

5. **Launch the hive**
   ```bash
   ./launchers/start-all-work.bat      # 5 agents in Windows Terminal tabs
   ```

6. **Customize agent definitions** — edit `.claude/agents/coordinator.md`, `dev-lead.md`, `worker.md` for your domain

7. **Add file lock hooks** — copy `hooks/check-file-lock.sh` into your project's `.claude/hooks/` and reference in `.claude/settings.json`

## License

MIT

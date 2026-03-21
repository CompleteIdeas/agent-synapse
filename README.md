# AgentSynapse

> **Preview** — This project is in active development with known bugs. It works well for our workflows but isn't production-ready for general use yet. Feedback, issues, and ideas are welcome. If you're looking for the stable memory system (works standalone without AgentSynapse), see [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory).

**Multi-agent orchestration with persistent memory for Claude Code.**

AgentSynapse is a framework for running multiple Claude Code agents in parallel — with shared memory, coordinated task assignment, file locking, and autonomous orchestration. It combines two core systems:

- **Memory** (`@agent-synapse/memory`) — Cognitive memory layer for AI agents. Activation-based retrieval, salience filtering, Hebbian learning, and associative connections. Agents remember across sessions.
- **Coordinator** (`@agent-synapse/coordinator`) — Real-time multi-agent coordination. Task dispatch, file locks, heartbeats, worker discovery, and command broadcasting.

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│ Orchestrator │    │   Coordinator    │    │  Worker-A    │
│              │◄──►│   port 8410      │◄──►│              │
└──────┬───────┘    └──────────────────┘    └──────┬───────┘
       │                                           │
       │            ┌──────────────────┐           │
       └───────────►│     Memory       │◄──────────┘
                    │   port 8400      │
                    │   (AWM / MCP)    │
                    └──────────────────┘
```

## How It Works

1. **Start the services** — Memory (port 8400) and Coordinator (port 8410)
2. **Launch workers** — Each worker is a separate Claude Code session in its own terminal
3. **Launch the orchestrator** — Reads your task database, discovers workers, assigns work
4. **Workers adapt** — Generic workers (Worker-A, B, C) take on whatever role the task needs
5. **Memory persists** — Agents write discoveries to shared memory; future sessions recall them
6. **File locks prevent collisions** — A PreToolUse hook blocks edits on files locked by another agent

## Quick Start

```bash
# Clone
git clone https://github.com/your-org/agent-synapse.git
cd agent-synapse

# Install
npm install

# Start both services
npm run dev

# In separate terminals, launch agents
./launchers/start-worker.bat orchestrator   # Tab 1: Orchestrator
./launchers/start-worker.bat Worker-A       # Tab 2: Worker
./launchers/start-worker.bat Worker-B       # Tab 3: Worker
./launchers/start-worker.bat               # Tab 4: Auto-assigns Worker-C

# Or launch everything at once (Windows Terminal)
./launchers/start-all.bat
```

## Project Structure

```
agent-synapse/
├── packages/
│   ├── memory/              # Cognitive memory (AWM)
│   │   ├── src/
│   │   │   ├── core/        # Decay, salience, Hebbian learning, embeddings
│   │   │   ├── engine/      # Activation, consolidation, staging, eviction
│   │   │   ├── storage/     # SQLite with FTS5
│   │   │   ├── api/         # REST API (Fastify)
│   │   │   ├── mcp.ts       # MCP server (Claude Code integration)
│   │   │   └── cli.ts       # CLI tool
│   │   └── tests/
│   └── coordinator/         # Agent coordination
│       └── src/
│           ├── db.ts         # SQLite schema (agents, assignments, locks, commands)
│           └── routes/       # REST API (checkin, assign, lock, command, status)
├── agents/                  # Claude Code agent definitions
│   ├── worker.md            # Generic worker — adapts role per task
│   └── orchestrator.md      # Autonomous orchestrator — manages the hive
├── hooks/                   # Claude Code PreToolUse hooks
│   └── check-file-lock.sh   # Blocks edits on files locked by another agent
├── launchers/               # Start scripts
│   ├── start-all.bat        # Launch coordinator + orchestrator + 3 workers
│   ├── start-worker.bat     # Launch a single worker (auto-names Worker-A/B/C)
│   └── start-coordinator.bat
└── examples/                # Example project configurations
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

### Orchestrator

The orchestrator runs autonomously:

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

1. **Install and start the services** (memory + coordinator)
2. **Copy `agents/` into your `.claude/agents/`** — customize task descriptions for your domain
3. **Copy `hooks/check-file-lock.sh` into your `.claude/hooks/`** — add to `.claude/settings.json`
4. **Configure MCP** in your Claude Code settings to connect to the memory server
5. **Customize launchers** for your project paths

## License

MIT

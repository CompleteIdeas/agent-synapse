# AgentSynapse Update — March 27, 2026

For team members who already have AgentSynapse cloned and working. This is a major update (~100 commits) covering cross-platform support, push channels, launcher rewrites, and AWM hardening.

---

## Before you pull

### Save your workspace config

`synapse.workspaces.json` is now **untracked and gitignored** (it contains user-specific paths). Git pull will remove it from your working tree. Save it first:

```bash
cd agent-synapse
cp synapse.workspaces.json synapse.workspaces.json.bak
```

### Back up your memory database

Your memory DB will auto-migrate, but back it up just in case:

```bash
cp data/memory.db data/memory-backup.db
```

---

## Update steps

### 1. Pull and update submodules

```bash
git pull origin master
git submodule update --init --recursive
```

### 2. Clean install dependencies

The npm workspaces config changed (removed deprecated `packages/coordinator`). Clean install is safest:

```bash
rm -rf node_modules packages/*/node_modules
npm install
```

This installs all workspace packages: AWM, task-manager, memory-client, and the new synapse-push.

Verify the build:

```bash
npm run build
```

Should complete with no errors (builds AWM, task-manager, memory-client, synapse-push).

### 3. Restore your workspace config

```bash
cp synapse.workspaces.json.bak synapse.workspaces.json
```

If you lost it or are setting up fresh, copy the example:

```bash
cp synapse.workspaces.example.json synapse.workspaces.json
```

Then edit `synapse.workspaces.json` with your paths. Example:

```json
{
  "workspaces": {
    "myproject": {
      "name": "MYPROJECT",
      "projectDir": "C:\\Users\\you\\your-project",
      "_projectDir_unix": "/Users/you/your-project",
      "agents": [
        { "name": "coordinator", "role": "coordinator", "delay": 0 },
        { "name": "Dev-Lead", "role": "dev-lead", "delay": 5 },
        { "name": "Worker-A", "role": "worker", "delay": 8 },
        { "name": "Worker-B", "role": "worker", "delay": 11 }
      ]
    }
  }
}
```

**Note:** `synapse.workspaces.json` will never be committed again. It stays local to your machine.

### 4. Verify MCP config

Check `.claude/mcp.json` in the repo (this is committed and should already be correct):

```json
{
  "mcpServers": {
    "agent-working-memory": {
      "command": "npx",
      "args": ["tsx", "./packages/awm/src/mcp.ts"],
      "env": { "AWM_DB_PATH": "./data/memory.db" }
    }
  }
}
```

If you have a global `~/.mcp.json` pointing to an old AWM install, you can remove it. The project-level config takes priority when you're in the AgentSynapse directory.

### 5. Start the hive

Use the shortcut script for your workspace:

```bash
# Work workspace
launchers\start-all-work.bat

# Personal workspace
launchers\start-all-personal.bat

# Interactive menu (pick workspace)
launchers\start-all.bat
```

These all delegate to `launch-hive.cjs`, which handles everything:
- Starts AWM with coordination (port 8400) if not already running
- Loads the synapse-push plugin for channel notifications (if enabled)
- Opens each agent in a Windows Terminal tab with model + channel flags set
- Waits for AWM health before launching agents

Verify:

```bash
curl http://127.0.0.1:8400/health
# {"status":"ok", ...}

curl http://127.0.0.1:8400/workers
# Should list your agents
```

To view AWM logs in real-time (color-coded):

```bash
launchers\awm-log.bat
```

---

## What changed

### Cross-platform support (new)

Launchers now work on **Windows, macOS, and Linux**. Previously Windows-only.

| Platform | Terminal | Fallback |
|----------|----------|----------|
| Windows | Windows Terminal (tabbed) | Separate cmd windows |
| macOS | Terminal.app (osascript) | Background processes |
| Linux | gnome-terminal / xterm | Background processes |

New files:
- `launchers/start-worker.sh` — Unix equivalent of `start-worker.bat`
- `launchers/shutdown.sh` — Unix shutdown script

### Push channels (new, optional)

Agents can now receive assignments via push notifications instead of polling `/next`. This is enabled by default in `synapse.config.json` but **degrades gracefully** — if your Claude Code org doesn't support channels, agents fall back to polling automatically.

How it works:
1. `launch-hive.cjs` assigns each worker a random port (50000-59999)
2. A channel server runs on that port (via `synapse-push/dist/channel-server.js`)
3. When the coordinator assigns work, `synapse-push` POSTs to the worker's channel server
4. The channel server wakes the agent via Claude Code's channel mechanism

To disable channels (polling-only mode), set in `synapse.config.json`:

```json
"channels": { "enabled": false }
```

### Model overrides

Models are now configured per-role in `synapse.config.json`:

```json
"models": {
  "coordinator": "opus",
  "dev-lead": "opus",
  "worker": "sonnet"
}
```

Override per-agent in `synapse.workspaces.json`:

```json
{ "name": "Worker-A", "role": "worker", "delay": 8, "model": "opus" }
```

### AWM submodule updates

Major hardening since the last update:

- **Plugin system** — AWM loads plugins via `AWM_PLUGINS` env var (used by synapse-push)
- **Coordination event emitter** — 7 typed events (assignment.created, agent.checkin, etc.)
- **Auto-unblock** — completing an assignment auto-unblocks dependent assignments
- **Crash-consistency** — coordination routes wrapped in SQLite transactions
- **Write mutex** — protects against SQLite burst writes during high-frequency operations
- **Pulse coalescing** — reduces DB writes from agent heartbeats
- **WAL auto-checkpoint** — prevents unbounded WAL growth
- **`/health/deep` endpoint** — returns WAL size, memory stats, agent counts
- **`/timeline` endpoint** — coordination event history
- **`/decisions` endpoint** — agents share decisions across the hive

### Hooks (13 total)

Settings now include resilience hooks. These are already in `.claude/settings.json` (committed):

| Hook | Event | Purpose |
|------|-------|---------|
| file-lock-check | PreToolUse (Edit) | Prevents editing files locked by other agents |
| pre-compact | PreCompact | Checkpoints memory before context compaction |
| session-end | SessionEnd | Checkout + checkpoint on exit |
| coordinator-watchdog | Notification | Timer-based stale recovery + monitoring |
| cwd-changed | CwdChanged | Detects directory changes |
| file-changed | FileChanged | Detects external file modifications |
| teammate-idle | TeammateIdle | Triggers assignment polling when teammates finish |
| task-created | TaskCreated | Auto-claims new tasks when idle |
| task-completed | TaskCompleted | Chains follow-up work |
| stop-failure | StopFailure | Recovery when agent fails to stop |
| worktree-create | WorktreeCreate | Tracks git worktree creation |
| worktree-remove | WorktreeRemove | Tracks git worktree removal |
| post-compact | PostCompact | Restores memory after compaction |

### Launcher improvements

- `launch-hive.cjs` reads workspaces from `synapse.workspaces.json` (no hardcoded paths)
- `spawn-worker.cjs` opens tabs in the existing hive terminal window
- Stale agent recovery runs automatically via coordinator watchdog hook
- `start-worker.bat` / `start-worker.sh` derive workspace from project path

### Removed / deprecated

- `packages/coordinator/` — coordination is now built into AWM (port 8400). The separate coordinator package is deprecated and removed from npm workspaces.
- "Orchestrator" terminology — renamed to "coordinator" throughout agent definitions and docs.

---

## Troubleshooting

### "synapse.workspaces.json not found" on launch

You need to create it from the example:

```bash
cp synapse.workspaces.example.json synapse.workspaces.json
# Edit with your paths
```

### "npm install fails" or "build fails"

```bash
node --version  # Must be 20+
rm -rf node_modules packages/*/node_modules
npm install
npm run build
```

### Agents can't find each other / coordination 404s

Make sure AWM starts with coordination enabled. The launcher handles this, but manually:

```bash
AWM_COORDINATION=true npx tsx packages/awm/src/index.ts
```

### Workers show as "STALE"

The stale threshold is 120 seconds. Workers go stale during long-running operations (docker pulls, migrations). The coordinator watchdog auto-recovers stale workers and reassigns their tasks. If a worker is actually alive but showing stale, it will self-recover on its next `/next` poll.

### Channel push not working

Channels require Claude Code v2.1.80+ with Teams channels enabled. If not available, agents fall back to `/next` polling automatically. No action needed.

To verify channel status:

```bash
curl http://127.0.0.1:8400/status
# Check "channel_sessions" in the response
```

---

## Quick reference

| Command | Purpose |
|---------|---------|
| `launchers\start-all-work.bat` | Launch work workspace hive |
| `launchers\start-all-personal.bat` | Launch personal workspace hive |
| `launchers\start-all.bat` | Interactive workspace menu |
| `node launchers/launch-hive.cjs status` | Check who's online |
| `node launchers/launch-hive.cjs shutdown` | Stop all agents |
| `launchers\awm-log.bat` | Tail AWM logs (color-coded) |
| `npm run build` | Build all packages |
| `npm run dev` | Start AWM with coordination (dev mode) |
| `curl localhost:8400/health` | AWM health check |
| `curl localhost:8400/workers` | List connected agents |
| `curl localhost:8400/status` | Full hive status |
| `curl localhost:8400/assignments` | View all assignments |
| `curl localhost:8400/findings` | View agent findings |

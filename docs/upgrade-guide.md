# Upgrade to AgentSynapse + AWM v0.6.0

For staff upgrading from an older version of AWM and/or AgentSynapse. Your memory database is preserved — everything else gets rebuilt.

---

## What you're getting

- **AWM v0.6.0** — memory taxonomy, query-adaptive retrieval, confidence on use, eval harness (4/4 benchmarks passing)
- **AgentSynapse** — multi-agent coordination built into AWM (worker registration, task dispatch, file locking, decision propagation)
- **Everything runs locally** — SQLite + ONNX models + Node.js. No cloud, no API keys.

---

## Prerequisites

- **Node.js 20+** — check with `node --version`
- **Git** — for cloning and submodules
- **Claude Code** (`claude`) — [Install Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- **Windows Terminal** (recommended) — for tabbed agent windows

---

## Step 1: Back up your memory database

Your AWM memory database is a single SQLite file. Find it and copy it somewhere safe.

```bash
# Default location (global install)
cp "$(npm root -g)/agent-working-memory/memory.db" ~/memory-backup.db

# Or find it — it's wherever AWM_DB_PATH points
# Check your .mcp.json for the path:
cat ~/.mcp.json
# Look for AWM_DB_PATH in the env section
```

If you can't find it, check these common locations:
- `~/.claude/memory.db`
- `C:\Users\<you>\AppData\Roaming\npm\node_modules\agent-working-memory\memory.db`
- The directory where you ran `awm setup`

**Keep this backup until you've verified the upgrade works.**

---

## Step 2: Uninstall the old AWM global package

```bash
npm uninstall -g agent-working-memory
```

This removes the old CLI (`awm`) and MCP server. Your memory database file is NOT deleted — it's just a `.db` file on disk.

---

## Step 3: Clone AgentSynapse

```bash
cd ~/projects  # or wherever you keep repos
git clone https://github.com/CompleteIdeas/agent-synapse.git
cd agent-synapse
git submodule update --init
```

This pulls AgentSynapse with AWM v0.6.0 as a submodule in `packages/awm/`.

---

## Step 4: Install dependencies

```bash
npm install
```

This installs all packages (AWM, coordinator, task-manager) via npm workspaces.

Verify the build:

```bash
npm run build
```

Should complete without errors.

---

## Step 5: Restore your memory database

Copy your backed-up database into the AWM package directory:

```bash
cp ~/memory-backup.db packages/awm/memory.db
```

AWM will automatically migrate the database schema on startup — new columns and tables are added without losing existing data.

---

## Step 6: Install AWM v0.6.0 globally (for MCP + CLI)

```bash
npm install -g agent-working-memory@0.6.0
```

Then reconfigure Claude Code:

```bash
awm setup --global
```

This updates:
- `~/.mcp.json` — MCP server configuration
- `~/.claude/CLAUDE.md` — memory workflow instructions
- `~/.claude/settings.json` — auto-checkpoint hooks

---

## Step 7: Restart Claude Code

Close and reopen Claude Code (or restart your terminal). The new MCP server loads automatically.

Verify:

```
> What memory tools do you have?
```

You should see 14 tools: `memory_write`, `memory_recall`, `memory_restore`, `memory_feedback`, `memory_retract`, `memory_supersede`, `memory_stats`, `memory_checkpoint`, `memory_task_add`, `memory_task_update`, `memory_task_list`, `memory_task_next`, `memory_task_begin`, `memory_task_end`.

Check your existing memories survived:

```
> How many memories do I have? (use memory_stats)
```

---

## Step 8: Verify the upgrade

Run the test suite to make sure everything works:

```bash
cd agent-synapse/packages/awm

# Quick checks
npm run test:run       # 77 unit tests
npm run test:mcp       # MCP protocol smoke test

# Full benchmark (takes ~2 min, needs embedding model download on first run)
npm run eval
```

Expected: all tests pass, eval shows 4/4 suites passing.

---

## Step 9 (Optional): Set up multi-agent coordination

If you want to run multiple Claude Code agents with coordination:

### Configure workspaces

```bash
cp synapse.workspaces.example.json synapse.workspaces.json
```

Edit `synapse.workspaces.json` — set `projectDir` to your project path:

```json
{
  "workspaces": {
    "myproject": {
      "name": "MYPROJECT",
      "projectDir": "C:\\Users\\you\\your-project",
      "agents": [
        { "name": "coordinator", "role": "coordinator", "delay": 0 },
        { "name": "Worker-A", "role": "worker", "delay": 5 },
        { "name": "Worker-B", "role": "worker", "delay": 8 }
      ]
    }
  }
}
```

### Start the hive

```bash
# Start AWM with coordination enabled
./launchers/start-services.bat

# In separate terminals:
./launchers/start-worker.bat coordinator
./launchers/start-worker.bat Worker-A
./launchers/start-worker.bat Worker-B
```

Or launch everything at once:

```bash
./launchers/start-all.bat
```

### Verify coordination

```bash
curl http://localhost:8400/health
# Should show: {"status":"ok","coordination":true}

curl http://localhost:8400/workers
# Should list your connected workers
```

---

## Troubleshooting

### "memory tools not showing up"

1. Check `~/.mcp.json` exists and has the AWM entry
2. Restart Claude Code completely (not just a new conversation)
3. Run `awm setup --global` again

### "database migration errors"

AWM auto-migrates on startup. If you see errors:

1. Check your backup is intact (`~/memory-backup.db`)
2. Delete `packages/awm/memory.db` and start fresh
3. If you need the old data, open an issue — we can help migrate manually

### "npm install fails"

```bash
# Clear node_modules and retry
rm -rf node_modules packages/*/node_modules
npm install
```

### "build fails"

```bash
node --version   # Must be 20+
npm run build    # Check for TypeScript errors
```

### "coordination endpoints return 404"

Make sure AWM is started with coordination enabled:

```bash
AWM_COORDINATION=true npx tsx packages/awm/src/index.ts
```

Or use the launcher: `./launchers/start-services.bat`

---

## What changed in v0.6.0

| Feature | Old | New |
|---------|-----|-----|
| Memory types | All untyped | Episodic / Semantic / Procedural auto-classification |
| Retrieval | Same pipeline for all queries | Query-adaptive: targeted vs exploratory modes |
| Confidence | Static (set on write) | Grows with retrieval (diminishing returns, cap 0.85) |
| Consolidation | Redundancy threshold 0.85 | Lowered to 0.75 — catches paraphrases, improves retrieval by 30% |
| Coordination | Separate package (port 8410) | Built into AWM (port 8400) — single service |
| Task dispatch | FIFO only | Priority field (0-10) + blocked_by dependencies |
| Completion | No verification | Workers must provide proof of work (result + optional commit SHA) |
| Decision sharing | None | Automatic — decisions propagate to all agents via memory |
| Benchmarks | No formal eval | 4-suite eval harness: `npm run eval` |
| DB safety | WAL only | + busy_timeout, integrity check, hot backups, WAL checkpoint |

---

## Quick reference

| Command | Purpose |
|---------|---------|
| `awm setup --global` | Configure Claude Code for AWM |
| `npm run build` | Build all packages |
| `npm run eval` | Run benchmark suite (4 suites) |
| `npm run test:mcp` | MCP smoke test |
| `npm run test:run` | Unit tests (77) |
| `./launchers/start-all.bat` | Launch full hive (AWM + workers) |
| `curl localhost:8400/health` | Check AWM status |
| `curl localhost:8400/workers` | List connected agents |

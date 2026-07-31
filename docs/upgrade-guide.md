# Upgrade AgentSynapse + AWM (to latest)

For staff on an **old** version of AgentSynapse / AWM. Your **memory database is preserved**; everything else is rebuilt. If your version is *really* old, a clean **re-clone** is safer than `git pull` (the project went through a multi-repo → one-repo restructure).

Current versions: **AgentSynapse** one-repo · **AWM submodule v0.8.6**.

---

## If you're coming from an old version, here's what changed

- **One repo.** Everything lives in `agent-synapse`, with AWM as a submodule in `packages/awm/`. The old separate AWM repo and separate `packages/coordinator` are gone.
- **Coordination is built into AWM** (HTTP on **port 8400**). The old standalone coordinator (port 8410) is removed.
- **Agents wake via a Claude Code channel plugin** (`awm@agentsynapse`) + push notifications — installed by `setup.bat`. This replaces the old global `npm i -g agent-working-memory` + `awm setup --global` flow. If your Claude org doesn't support channels, agents fall back to `/next` polling automatically.
- **Launchers** are `launchers\start-all-work.bat` / `start-all-personal.bat` / `start-all.bat`, all delegating to `launch-hive.cjs` (cross-platform, reads `synapse.workspaces.json`).
- **`synapse.workspaces.json`** is user-specific and gitignored (never committed).

---

## Prerequisites

- **Node.js 20+** (`node -v`)
- **Git** (`git --version`)
- **Claude Code v2.1.x+** (`claude --version`), signed into the **USEA Claude Team** account (`claude auth` — channels require the Team plan, not a personal account)
- **Windows Terminal** (Win 11 default; Win 10 → Microsoft Store)

---

## Step 1 — Back up your memory database

Your AWM memory is one SQLite file. Find it via `AWM_DB_PATH` in your old config and copy it somewhere safe:

```bash
# Old global install — common locations:
cp "$(npm root -g)/agent-working-memory/memory.db" ~/memory-backup.db
#   or  ~/.claude/memory.db   or   C:\Users\<you>\AppData\Roaming\npm\node_modules\agent-working-memory\memory.db
```

Also save your old `synapse.workspaces.json` if you have one. **Keep the backup until the upgrade is verified.**

---

## Step 2 — Remove the OLD global AWM (only if you had it)

```bash
npm uninstall -g agent-working-memory
```

Delete any old global `~/.mcp.json` AWM entry too — the new model is repo-local + the channel plugin. (Your `.db` file is not touched.)

---

## Step 3 — Get the latest code

**Really old version → fresh clone (recommended):**
```bash
cd ~/projects   # or wherever you keep repos
git clone https://github.com/CompleteIdeas/agent-synapse.git
cd agent-synapse
git submodule update --init
```

**Already on a recent clone → pull instead** (save your workspaces file first, it'll be removed by pull):
```bash
cp synapse.workspaces.json synapse.workspaces.json.bak
git pull origin master
git submodule update --init --recursive
```

> Requires access to the private **CompleteIdeas** GitHub org. Ask Robert if `git clone` 404s.

---

## Step 4 — Install & build

```bash
npm install                         # all workspaces: awm, task-manager, memory-client, synapse-push
cd packages/synapse-push && npm run build && cd ../..   # build the push/channel server
npm run build                       # build all packages (verify no errors)
```

If install or build fails:
```bash
node --version                      # must be 20+
rm -rf node_modules packages/*/node_modules
npm install
```

---

## Step 5 — Restore your memory database

Copy your backup to the path AWM uses (default `packages/awm/memory.db` — confirm via `AWM_DB_PATH` in `.claude/mcp.json`):

```bash
cp ~/memory-backup.db packages/awm/memory.db
```

AWM **auto-migrates** the schema on startup (adds new columns/tables, no data loss).

---

## Step 6 — Configure your workspace

```bash
copy synapse.workspaces.example.json synapse.workspaces.json     # cp on macOS/Linux
```

Edit `synapse.workspaces.json` — set `projectDir` to **your** machine's project path. It stays local (gitignored), so it's never overwritten by future pulls. Example:

```json
{
  "workspaces": {
    "work": {
      "name": "WORK",
      "projectDir": "C:\\Users\\YOUR_USERNAME\\project",
      "memoryId": "work",
      "agents": [
        { "name": "coordinator", "role": "coordinator", "delay": 0, "model": "opus" },
        { "name": "Dev-Lead", "role": "dev-lead", "delay": 5, "model": "opus" },
        { "name": "Worker-A", "role": "worker", "delay": 8 },
        { "name": "Worker-B", "role": "worker", "delay": 11 },
        { "name": "Worker-C", "role": "worker", "delay": 14 }
      ]
    }
  }
}
```

(Default per-role models live in `synapse.config.json`; override per-agent here with `"model"`.)

---

## Step 7 — Run setup (plugin + channels)

```bash
.\setup.bat
```

This registers the **agentsynapse** plugin marketplace with Claude Code and installs the **`awm@agentsynapse`** channel plugin (push notifications that wake agents). Expect:

```
✔ Successfully added marketplace: agentsynapse
✔ Successfully installed plugin: awm@agentsynapse
```

("Already installed" is fine.) If it fails, run it again or do it manually:
```bash
claude plugin marketplace add .\marketplace
claude plugin install awm@agentsynapse
```

---

## Step 8 — Verify your Claude Team account

```bash
claude auth      # must show your USEA email + "Claude Team" plan
```

Channels require the Team plan. The Team admin (Robert) has already set `allowedChannelPlugins` — no action needed from you.

---

## Step 9 — Launch the hive

```bash
.\launchers\start-all-work.bat        # 5 tabs: coordinator, dev-lead, 3 workers
# or  .\launchers\start-all-personal.bat   /   .\launchers\start-all.bat  (interactive menu)
```

`launch-hive.cjs` starts AWM (port 8400) if needed, loads the push plugin, and opens each agent in a Windows Terminal tab. Each tab should show `Listening for channel messages from: plugin:awm@agentsynapse`.

Verify (in a separate terminal):
```bash
curl -s http://127.0.0.1:8400/health             # {"status":"ok",...}
curl -s http://127.0.0.1:8400/workers            # 5 agents, "status":"idle"
curl -s http://127.0.0.1:8400/channel/sessions   # each agent connected with a channel_id
```

Check your memories survived — in any agent tab: `How many memories do I have? (use memory_stats)`.

---

## Updating again later (already on a recent clone)

```bash
cd agent-synapse
git pull origin master
git submodule update --init --recursive
npm install
cd packages/synapse-push && npm run build && cd ../..
claude plugin update awm@agentsynapse
```
Then relaunch the hive.

---

## Old → now, at a glance

| | Old | Now |
|---|---|---|
| Repos | Separate AWM + coordinator repos | One repo (`agent-synapse`), AWM as submodule |
| Coordination | Standalone coordinator (port 8410) | Built into AWM (port 8400) |
| Agent wake-up | Poll `/next` | Channel plugin push (`awm@agentsynapse`), polling fallback |
| Install | `npm i -g agent-working-memory` + `awm setup --global` | Repo-local + `setup.bat` (plugin) |
| Launch | `start-services.bat` + per-worker | `launch-hive.cjs` via `start-all-*.bat` |
| Config | hardcoded paths | `synapse.workspaces.json` (local, gitignored) |
| AWM | ≤0.6.x | **0.8.6** (taxonomy, query-adaptive recall, plugin system, crash-consistency, `/timeline` `/decisions` `/health/deep`) |

---

## Troubleshooting

- **Plugin not found / agents don't wake** → re-run `setup.bat`; check `curl http://127.0.0.1:8400/channel/sessions`. `not on the approved channels allowlist` → personal (not Team) account, contact admin. Agents fall back to a 15-min heartbeat poll regardless.
- **AWM not on 8400** → it starts with the hive; close everything and relaunch `start-all-work.bat`.
- **npm install / build fails** → Node 20+, then `rm -rf node_modules packages/*/node_modules && npm install`.
- **`synapse.workspaces.json not found`** → `copy synapse.workspaces.example.json synapse.workspaces.json` and edit paths.
- **Coordination endpoints 404** → AWM didn't start with coordination; the launcher handles it, or manually `AWM_COORDINATION=true npx tsx packages/awm/src/index.ts`.
- **Database migration errors** → restore from `~/memory-backup.db`; or delete `packages/awm/memory.db` to start fresh.
- **Extra Claude windows / wrong CLI** → a `claude.bat` in your project dir shadows the real CLI; rename it.

See also: `docs/TEAM-SETUP.md` (fresh-install onboarding), `docs/troubleshoot-install.md`, `docs/update-march-2026.md`.

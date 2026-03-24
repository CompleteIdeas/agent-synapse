# AgentSynapse Install Troubleshooting (Windows)

## Goal
Get AgentSynapse running on this machine. AWM with coordination must start on http://127.0.0.1:8400, then the hive (coordinator + workers) can launch.

## What AgentSynapse Is
A multi-agent coordination system for Claude Code. It has these packages:
- `packages/coordinator` — HTTP API (Fastify + better-sqlite3)
- `packages/awm/` — Git submodule pointing to [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory) (MCP memory server). Run `git submodule update --init` after cloning.
- `packages/task-manager` — Sprint/task tracker (Fastify + better-sqlite3)

## Repo
- GitHub: `CompleteIdeas/agent-synapse`
- Clone to: anywhere convenient (e.g. `C:\dev\agent-synapse`)

## Install Steps

### 1. Clone and install
```
git clone https://github.com/CompleteIdeas/agent-synapse.git
cd agent-synapse
git submodule update --init
npm install
```

### 2. If `better-sqlite3` fails during npm install
This is the most common issue. `better-sqlite3` is a native C++ module that needs prebuilt binaries.

**Check your Node version:**
```
node -v
```

- **Node 20.x LTS** — should have prebuilt binaries. If it still fails, try:
  ```
  npm cache clean --force
  rmdir /s /q node_modules
  npm install
  ```

- **Node 22.x or 24.x** — may NOT have prebuilt binaries. Switch to Node 20:
  ```
  nvm install 20
  nvm use 20
  node -v
  rmdir /s /q node_modules
  npm install
  ```

- If prebuilds still fail and it falls back to `node-gyp`:
  - Install Python 3.x from https://www.python.org/downloads/ (check "Add to PATH")
  - Install Visual Studio Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
  - Select "Desktop development with C++" workload
  - Then retry `npm install`

### 3. Build
```
npm run build
```
This compiles TypeScript for all 3 packages. Should complete silently (no output = success).

### 4. Link globally
```
npm link
```
This makes `agent-synapse` CLI available system-wide.

### 5. Initialize in your project
Go to your project folder and run:
```
cd C:\dev\my-project
npx agent-synapse init
```

If `npx agent-synapse init` fails with MODULE_NOT_FOUND, run directly:
```
node C:\Users\seetha\ClaudeCodeProjects\agent-synapse\bin\synapse.js init
```

### 6. Launch
```
launchers\start-all.bat
```

## Diagnosing Coordinator Startup Failure

If `start-all.bat` says "Coordinator not running", check the Coordinator window for errors. Or run manually:

```
cd C:\Users\seetha\ClaudeCodeProjects\agent-synapse
npx tsx packages/coordinator/src/index.ts
```

Common errors:
- **Cannot find module 'better-sqlite3'** — npm install failed, go back to step 2
- **Error: Could not locate the bindings file** — prebuilt binary missing, rebuild:
  ```
  npm rebuild better-sqlite3
  ```
- **EACCES / EPERM** — run terminal as Administrator

## Verify It Works

```
curl http://127.0.0.1:8400/health
```
Should return `{"status":"ok"}`.

## Updating Later

From the `agent-synapse` folder:
```
git pull
git submodule update --init
npm install
npm run build
```

No need to re-run `npm link` or `init` — the symlink and project config persist.

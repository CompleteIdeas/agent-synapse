# AgentSynapse — Team Setup Guide

Complete setup instructions for new team members. Follow every step in order.

## Prerequisites

Before you begin, make sure you have:

- [ ] **Node.js 20+** — run `node -v` to check. Download from [nodejs.org](https://nodejs.org/) if needed
- [ ] **Git** — run `git --version` to check. Download from [git-scm.com](https://git-scm.com/) if needed
- [ ] **Claude Code CLI** — run `claude --version` to check. Should show v2.1.x or later. Install from [claude.ai/download](https://claude.ai/download)
- [ ] **Claude Code authenticated** — run `claude` in any terminal. If it opens and shows the Claude logo, you're logged in. If not, run `claude auth` and follow the prompts to sign in with your USEA Claude Team account
- [ ] **Windows Terminal** — comes with Windows 11. If you're on Windows 10, install from the Microsoft Store

## Step 1: Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/CompleteIdeas/agent-synapse.git
cd agent-synapse
git submodule update --init
```

This clones AgentSynapse and pulls in the AWM (AgentWorkingMemory) submodule.

## Step 2: Install Dependencies

```bash
npm install
```

This installs all packages for AWM, synapse-push, and other modules.

## Step 3: Build the Channel Server

```bash
cd packages/synapse-push
npm run build
cd ../..
```

This compiles the push notification server that delivers assignments to agents.

## Step 4: Configure Your Workspace

```bash
copy synapse.workspaces.example.json synapse.workspaces.json
```

Open `synapse.workspaces.json` in a text editor and update the paths to match your machine:

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

Replace `YOUR_USERNAME` with your actual Windows username. The `projectDir` is where your code lives — the agents will work in this directory.

## Step 5: Run Setup

```bash
.\setup.bat
```

This does two things:
1. Registers the **agentsynapse** plugin marketplace with Claude Code
2. Installs the **AWM channel plugin** — this enables push notifications to wake agents

You should see:
```
✔ Successfully added marketplace: agentsynapse
✔ Successfully installed plugin: awm@agentsynapse
```

If the plugin was already installed, you'll see a message saying so — that's fine.

## Step 6: Verify Your Claude Team Account

The push notification system requires your Claude Code to be signed into the **USEA Claude Team** account (not a personal account). Check by running:

```bash
claude auth
```

You should see your USEA email and "Claude Team" as the plan. If you're on a personal account, sign out and sign in with your team credentials.

The Team admin has already configured the required `allowedChannelPlugins` setting — no action needed from you.

## Step 7: Launch the Hive

```bash
.\launchers\start-all-work.bat
```

This opens a **Windows Terminal window with 5 tabs**:

| Tab | Agent | Model | Role |
|-----|-------|-------|------|
| 1 | Coordinator | Opus | Manages the hive, assigns work |
| 2 | Dev-Lead | Opus | Scoping, architecture, task breakdown |
| 3 | Worker-A | Sonnet | General-purpose worker |
| 4 | Worker-B | Sonnet | General-purpose worker |
| 5 | Worker-C | Sonnet | General-purpose worker |

Each agent will:
1. Start Claude Code
2. Register with the coordinator (AWM on port 8400)
3. Restore shared memory
4. Idle at the prompt waiting for work

You should see this at the top of each tab:
```
Listening for channel messages from: plugin:awm@agentsynapse
```

**If you see `not on the approved channels allowlist`** — your Claude account is not on the Team plan, or the admin setting hasn't propagated yet. Contact the Team admin (Robert).

## Step 8: Verify Everything is Running

Open a new terminal (not one of the hive tabs) and run:

```bash
curl -s http://127.0.0.1:8400/workers
```

You should see all 5 agents listed with `"status": "idle"`.

Check channel sessions:
```bash
curl -s http://127.0.0.1:8400/channel/sessions
```

Each agent should have a `channel_id` URL and `"status": "connected"`.

## How It Works

### Assigning Work

Talk to the **Coordinator tab** (tab 1). Tell it what you want done:

```
Build the user profile page for EquiHub
```

The coordinator will:
1. Break the task into subtasks
2. Assign each subtask to an idle worker using `POST /assign`
3. Each worker receives a **← awm:** push notification and wakes up instantly
4. Workers complete their tasks and report back

### Monitoring

The coordinator monitors progress automatically. You can also check status anytime:

```bash
# See all agents
curl -s http://127.0.0.1:8400/workers

# See assignments
curl -s http://127.0.0.1:8400/assignments

# See findings (bug reports, results)
curl -s http://127.0.0.1:8400/findings

# Full dashboard
curl -s http://127.0.0.1:8400/status
```

### Stopping

Type `SHUTDOWN` in the coordinator tab. Or just close the Windows Terminal window.

## Troubleshooting

### "AWM not running on port 8400"
The AWM service didn't start. It starts automatically with the hive. Try closing everything and relaunching `start-all-work.bat`.

### Extra Claude Code windows open
Check if there's a `claude.bat` file in your project directory. If so, rename it — it shadows the real Claude CLI.

### Agents not waking up (no push notifications)
1. Check `curl -s http://127.0.0.1:8400/channel/sessions` — are sessions registered?
2. Check for `not on the approved channels allowlist` in the agent's header — contact Team admin
3. As a fallback, agents have a 15-minute heartbeat that checks for missed assignments

### "rate limit exceeded"
The coordinator API has a 300 req/min limit. If you're running automated scripts that hit it aggressively, add delays between calls.

### Plugin not found
Run `setup.bat` again. If it fails, try:
```bash
claude plugin marketplace add .\marketplace
claude plugin install awm@agentsynapse
```

## Updating

When the team pushes updates:

```bash
cd agent-synapse
git pull origin master
git submodule update --init
npm install
cd packages/synapse-push && npm run build && cd ../..
claude plugin update awm@agentsynapse
```

Then relaunch the hive.

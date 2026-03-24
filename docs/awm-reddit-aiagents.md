# Reddit Post — r/AI_Agents

**Title:** Built a persistent memory system for my multi-agent setup — sharing what's working in production

---

There are a lot of interesting memory solutions for AI agents right now — Mem0, Letta, Engram, and others. Many take the approach of extracting memories after the session ends with a separate pipeline, which makes a lot of sense for certain workflows.

My use case pushed me in a different direction, so I built [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory). The agent decides in-context what's worth remembering, using MCP tools during the conversation. Not saying it's the right approach for everyone — but it's been working well for my setup in production.

**My use case:**

I'm rebuilding a 1.4M-line legacy codebase with multiple agents running in parallel — an orchestrator assigning tasks to 3-4 workers. I also jump between development, support tasks, presentations, and other projects throughout the day. I needed memory that could keep up with that context switching, and I needed agents to share what they learn in real-time. When Worker-A discovers a database constraint that changes the migration plan, Worker-B needs to know about it during the current session, not after.

**How we enforce recall (the hard part):**

Lifecycle hooks in the agent's system prompt tell it *when* to remember and recall — session start, task begin, after failures, before refactors. The agent follows the instructions, MCP handles the rest. A salience filter rejects ~30% of write attempts as noise, and consolidation cycles prune over time. It maintains itself.

**What it does:**
- **In-context memory** — the agent writes memories as it works, decides what's worth keeping
- **Multi-agent shared pool** — all workers read/write the same memory in real-time
- **Memory pools** — isolated partitions (I run separate pools for work and personal projects)
- **Agent-agnostic** — MCP server for Claude Code/Cursor, HTTP API (`awm serve`) for anything else
- **Local-only** — SQLite, no cloud, no Docker, starts/stops with your editor

It's been running daily on a real production workload for a few weeks now — 225 active memories, ~2,800 associative connections formed automatically. It's not a benchmark project, just something I needed and figured was worth sharing.

Everything local, Apache 2.0. If you find it at all helpful, I'd love feedback — curious what approaches others are using too, especially for multi-agent coordination.

**Setup for Claude Code (two commands):**
```
npm install -g agent-working-memory
awm setup --global
```
Restart Claude Code and it just works — no server to run, no Docker. It starts with Claude via MCP and stops when you close. Planning to add a Codex setup command as well since it works across agent CLIs — still testing that.

[GitHub](https://github.com/CompleteIdeas/agent-working-memory)

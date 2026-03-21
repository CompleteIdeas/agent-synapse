# Reddit Post — r/ClaudeAI
**Flair:** Custom agents
**Title:** I built a memory system for Claude Code because --continue and CLAUDE.md weren't cutting it anymore

---

First time posting here. I've been using Claude Code since early access to rebuild a 20-year-old codebase (~1.4M lines) into a modern stack. A few months in I hit a wall that I think a lot of people here are dealing with — Claude has no real memory between sessions.

Yeah, I know about `--continue` and `--resume`. I use them. And auto-memory is nice. And I maintain a pretty detailed CLAUDE.md. But when you're working on something with 88 database tables across multiple sprints with multiple agents running in parallel... it's not enough. You end up being the agent's memory manager. Every session starts with re-explaining stuff it knew yesterday.

So I built something called [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory) (AWM). It's an MCP server that gives Claude actual persistent memory — not just notes in a file, but a system that decides what's worth remembering, forgets what isn't useful, forms connections between related memories, and retrieves the right context for whatever you're working on right now.

**How it's different from what's built in:**

- `--continue` replays your whole conversation. Expensive. AWM recalls just the 5-10 memories relevant to your current task.
- Auto-memory loads the same 200 lines every session. AWM has a multi-stage retrieval pipeline that surfaces different context depending on what you're doing.
- CLAUDE.md is great for stable stuff but you maintain it. AWM maintains itself — the agent writes memories, and consolidation cycles prune the noise over time.

They all work together though. I'm not replacing anything, just adding the layer that was missing.

**Some real numbers from my actual database (not benchmarks):**

- 225 active memories after a few weeks of daily use
- ~30% of write attempts rejected by the salience filter (noise kept out)
- 2,818 associative connections formed automatically between memories
- Most-accessed memory has been recalled 86 times across sessions
- About 64.5% fewer tokens used vs loading full conversation history (from our eval suite)

**The setup is literally two commands:**

```
npm install -g agent-working-memory
awm setup --global
```

Restart Claude Code and it just works. No server to run, no Docker, nothing running in the background. It starts with Claude Code via MCP and stops when you close. Everything local, no cloud.

Some other things it handles: isolated memory pools (work vs personal projects in one database), bearer token auth if you want security, incognito mode, execution checkpoints that survive context compaction, task tracking. A lot of the "yeah but what about..." stuff has been addressed from real usage.

**Multi-agent is where it really shines.** I run an orchestrator + workers in parallel and they share memory. When one agent finds a bug, the others know about it automatically. That was actually the original motivation for building it.

It also runs as a standalone HTTP server (`awm serve`) so it's not locked to Claude Code — any tool that can make HTTP calls can read/write memories.

I'm not claiming this is the only or best approach. There are smart people working on agent memory from a lot of angles. But it's been a game changer for my workflow, and I figured it was worth sharing. It's open source (Apache 2.0) and I'd genuinely love feedback.

[GitHub](https://github.com/CompleteIdeas/agent-working-memory) | `npm install -g agent-working-memory`

Anyone else hit this wall? Curious what other approaches people are using.

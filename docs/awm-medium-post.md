# How I Stopped Re-Explaining Everything to My AI Agent

*I got tired of being Claude's memory manager. So I built a system that lets it remember on its own.*

---

If you work with an AI coding agent every day, you've probably invented your own memory system without calling it that. A notes file you paste in. A project document with architecture decisions. Maybe you just hit `--continue` and hope the previous conversation carries enough context.

I did all of those things. And for a while, they worked.

Then the project got big.

## The breaking point

I was rebuilding a legacy system — a 20-year-old codebase, roughly 1.4 million lines — into a modern platform. 88 database tables, a multi-sprint plan, and I'd started running multiple Claude Code agents in parallel to move faster.

Every morning, same ritual. Open a fresh session. Re-explain the architecture. Re-explain the database schema. Re-explain what I decided last week and why. By the time the agent had enough context to be useful, I'd spent ten minutes and a significant chunk of my context window just catching it up on things it already knew twelve hours ago.

[SCREENSHOT: A fresh Claude Code session where you're re-explaining project context — the "before" state]

Claude Code has tools that help. You can resume a previous conversation with `--continue`. There's a built-in auto-memory that saves notes about your preferences. You can write a `CLAUDE.md` file with project instructions that loads every session.

But each has limits that showed up fast at scale:

**Resuming a conversation** brings back one chat thread — but all that old back-and-forth fills your context window. The knowledge isn't gone, it's just trapped in an increasingly expensive transcript.

**Auto-memory** saves quick notes to markdown files. It loads the first 200 lines of its index file at startup and Claude can read topic files on demand. But there's no retrieval intelligence. It doesn't know which notes matter for what you're working on right now. The notes don't connect to each other, strengthen from use, or fade when they're outdated.

**CLAUDE.md** is perfect for stable rules — coding conventions, project setup, architecture decisions. But when you're maintaining multiple docs across a fast-moving project, they drift. They go stale. You become the one maintaining the agent's memory, and that's a second job.

What I needed was something that could accumulate knowledge across sessions, figure out which context is relevant to the current task, and get better over time — without me managing it.

## So I built one

[AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory) (AWM) is a persistent memory system for AI agents. It runs entirely on your machine — a SQLite database, three local ML models (~124MB total, downloaded once), and a Node.js process. No cloud. No API keys. No data leaving your machine.

There's no server to run, no Docker container, no background daemon. When you start Claude Code, AWM spins up automatically through MCP (Model Context Protocol). When you close the session, it stops. Nothing runs when you're not using it. The data sits in a local database, waiting for the next session.

Setup is two commands:

```
npm install -g agent-working-memory
awm setup --global
```

Restart Claude Code, and 14 memory tools appear. That's the whole install.

[SCREENSHOT: Terminal showing the install + setup output, or Claude Code showing the available memory tools]

From that point on, the agent writes memories when it discovers something important, recalls relevant context when starting new work, and checkpoints its state so it can recover after interruptions. You don't manage any of it.

## What makes it different

The difference between AWM and a notes file isn't the storage. It's what happens around the storage.

### It decides what's worth keeping

About 30% of what the agent tries to store gets rejected before it ever hits the database. Routine observations, near-duplicates, low-value noise — filtered out by a novelty scoring system. Only things that are genuinely new, surprising, or causally significant make the cut.

This matters more than it sounds. Without filtering, a memory system becomes a junk drawer within a week. With it, the pool stays lean — mine has 225 active memories after several weeks of daily use across multiple projects.

### It retrieves with intelligence

When the agent needs context, it doesn't load a flat file. It runs a multi-stage retrieval pipeline: keyword matching, semantic search across vector embeddings, a cross-encoder model that judges passage-level relevance, then walks an association graph to surface related memories that weren't in the original query.

The result: when the agent starts work on the payment system, it gets the architecture decision about Stripe, the edge case someone found in fee calculations last week, and the naming convention for payment handlers. Not your entire project history. Not 200 lines of everything. Just what matters right now.

[SCREENSHOT: memory_recall results showing relevant memories with scores — the "targeted recall" moment]

### It builds connections over time

When two memories get recalled together, a link strengthens between them. These associations emerge from usage, not from someone manually linking notes. The graph gets richer the more you use the system — after 21 consolidation cycles, my database has 2,818 associative connections that nobody designed.

### It forgets on purpose

Unused memories fade. Frequently-accessed ones persist. You don't tag things as "important" — the system figures it out from access patterns. This is based on ACT-R, a well-studied model from cognitive science for how human memory activation works. Each time a memory is accessed, it gets another activation trace that strengthens it against decay. A one-off debugging note from two weeks ago that was never recalled again quietly fades toward archive.

### It consolidates

Periodically — at session end or on a timer — the system runs a consolidation cycle. Think of it like sleep for the brain. It strengthens clusters of related memories, builds bridges between topics, normalizes hub nodes so no single memory dominates retrieval, and archives low-value information. The system gets more precise over time, not noisier.

[SCREENSHOT: memory_stats showing active memories, edges, confidence, consolidation count]

## It works alongside what's already there

AWM doesn't replace Claude Code's built-in memory. It adds the layer that was missing.

Think of it as a stack:

- **CLAUDE.md** — your project's constitution. Stable rules and conventions, always loaded.
- **Auto-memory** — Claude's personal notebook. Quick notes about preferences and patterns.
- **--continue / --resume** — a tape recorder. Replay a previous conversation.
- **AWM** — long-term memory. Learns what matters, forgets what doesn't, surfaces the right thing at the right time.

Each layer handles a different kind of knowledge. They complement each other.

## Real numbers

I queried my actual database to see what's really happening. These aren't benchmarks — they're from daily use across several projects over a few weeks. Your numbers will look different depending on your workflow, but the patterns should be similar.

[SCREENSHOT: SQLite query or memory_stats showing the actual numbers below]

**225 active memories.** Not thousands. The salience filter and consolidation keep the pool focused. A bigger or older project would have more, but the filtering prevents unbounded growth.

**2,818 associative connections.** Formed automatically from co-retrieval patterns. Over 21 consolidation cycles, cross-topic bridges formed, weak links decayed, and hub nodes got normalized.

**Most-used memory accessed 86 times.** It's a foundational architecture decision that surfaces in almost every session. The ACT-R decay model means it's essentially permanent now. Meanwhile, one-off notes are quietly fading.

**~64.5% fewer tokens** (from our eval suite comparing memory-guided context vs full conversation history). This is the hidden power: instead of loading your entire previous conversation or a 500-line context document, AWM recalls only the 5-10 memories most relevant to your current task. You spend context window budget on signal, not noise.

## Multiple agents, multiple tools

This is where AWM became something the built-in tools can't replicate.

I run multiple Claude Code agents in parallel — an orchestrator managing tasks, coding workers implementing features, a dev-lead scoping work. They all share the same AWM database. When one agent discovers an undocumented constraint, the others pick it up automatically when they work on something related. No shared docs to maintain. Knowledge propagates across the team.

One database can hold multiple isolated memory pools — work projects and personal projects don't bleed into each other, different agent teams can have their own namespace, and you control the boundaries with a single environment variable. If you want an extra layer of security, AWM supports bearer token auth to lock down access.

AWM can also run as a standalone HTTP server (`awm serve`) with an API that any tool can call — not just Claude Code. Other AI assistants, CI pipelines, scripts, custom agents. Your memory travels with your project, not your IDE.

## Beyond code

The same problem — AI that forgets everything between sessions — shows up anywhere you're doing complex, long-running work with an AI assistant.

I was talking with an author recently who described exactly the frustration I had with code. Their AI assistant would forget character details mid-book, contradict established backstory, and lose track of which clues had been planted where. The more complex the story, the worse it got.

I haven't tested AWM with fiction writing yet, but the mechanics seem like a natural fit. Character details, plot threads, and foreshadowing could form an associative graph. Planted clues would form connections with their eventual payoffs. The "who knew what when" timeline could stay consistent without maintaining a massive spreadsheet. I'd love to hear from anyone who tries it.

Any field where context accumulates over time — research, legal work, game design, worldbuilding — could potentially benefit from AI that actually remembers.

## Get started

```
npm install -g agent-working-memory
awm setup --global
```

First run downloads about 124MB of ML models (cached locally after that). Everything runs on your machine.

There are a bunch of features I didn't get into here — incognito mode, task tracking, memory supersession, execution checkpoints that survive context compaction. A lot of the "yeah but what about..." problems that came up during real usage have been addressed. Check the [GitHub repo](https://github.com/CompleteIdeas/agent-working-memory) for the full picture.

It's open source under Apache 2.0. I'm not sure if the approach is truly novel — there are smart people working on agent memory from a lot of angles. But it's been a genuine game changer for my workflow, and I figured it was worth putting out there.

---

*AgentWorkingMemory is a [Complete Ideas](https://completeideas.com) project. The source code, documentation, and all eval suites are available on [GitHub](https://github.com/CompleteIdeas/agent-working-memory).*

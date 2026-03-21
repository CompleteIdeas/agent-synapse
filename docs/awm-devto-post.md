---
title: "How I Stopped Re-Explaining Everything to My AI Agent"
published: false
description: AI coding agents forget everything between sessions. Claude Code's built-in memory helps, but it wasn't enough. So I built something that actually learns.
tags: ai, claude, productivity, opensource
cover_image:
canonical_url:
---

*Reddit intro (delete for Medium/DEV.to):*

> First time posting here. I've been working with Claude Code since early access, using it to rebuild a 20-year-old codebase (~1.4 million lines) from scratch into a modern stack (estimating ~250K lines when done). A few months in, I ran into a problem I couldn't find a complete solution for — AI agents have no memory between sessions. I found a few projects tackling pieces of it, but nothing that handled the full picture: what to remember, what to forget, how to retrieve the right context, and how to share knowledge across multiple agents working in parallel.
>
> So I built something. I'm not sure if the approach is truly novel — there are smart people working on this problem from a lot of angles, and I'm sure there are things I'm not aware of. But it's been a genuine game changer for my workflow, and I figured it was worth sharing in case anyone else is hitting the same walls. It's open source, and I'd honestly love feedback on what could be better. Happy to answer questions.



---

If you use an AI coding agent every day, you've probably built your own memory system without realizing it. A notes file you paste in at the start of each session. A carefully maintained project document with architecture decisions and conventions. Maybe you just use `--continue` and hope it picks up where you left off.

It works — until it doesn't.

## The Problem

I was building a membership management platform. Not a small one — 88 database tables, a multi-sprint development plan, and I was running multiple AI agents in parallel to move faster. Every morning, same ritual: open a new session, re-explain the architecture, re-explain the database schema, re-explain the decisions I made last week. By the time the agent had enough context to be useful, I'd burned ten minutes and a chunk of my context window on things it already knew yesterday.

Claude Code has some tools for this now. You can resume a previous conversation with `--continue`. There's a built-in auto-memory that saves notes about your preferences and patterns to markdown files. You can write a `CLAUDE.md` file with project instructions that loads every session.

These are useful. But they have limits:

**Resuming a conversation** (`--continue` / `--resume`) restores a previous chat thread — messages, tool calls, everything. But you can only resume one thread at a time, and all that old conversation history eats your context window. The knowledge isn't gone, but it's trapped in a single thread that gets more expensive to carry forward with every exchange.

**Auto-memory** saves text notes about things Claude learns — build commands, your preferences, debugging patterns. It loads the first 200 lines of its index file (`MEMORY.md`) at session start, and Claude can read deeper topic files on demand. But there's no retrieval intelligence — it doesn't know which notes are relevant to what you're working on right now. And the notes don't strengthen, decay, or connect to each other over time.

**Project docs** (`CLAUDE.md`) work great for stable information — project setup, coding conventions, architecture rules. But when you're maintaining multiple docs or the project evolves fast, they go stale. You become the one maintaining the agent's memory, and that's a second job.

What I needed was something that could **accumulate knowledge across sessions, surface the right context for whatever I'm working on right now, and get better over time without me managing it.**

So I built [AgentWorkingMemory](https://github.com/CompleteIdeas/agent-working-memory).

## What It Does

AWM lives entirely on your machine — a SQLite database, three local ML models (~124MB total, downloaded once), and a Node.js process. There's no server to run, no Docker container, no background daemon to manage. When you start Claude Code, it automatically spins up AWM through MCP (Model Context Protocol). When you close the session, it stops. Nothing is running when you're not using it. Everything stays local — no cloud, no API keys, no data leaving your machine. If you want an extra layer of security, AWM supports bearer token auth so you can lock down access to the memory API.

The setup is two commands:

```bash
npm install -g agent-working-memory
awm setup --global
```

Restart Claude Code and 14 memory tools appear automatically. The first session takes about 30 seconds while the ML models download (~124MB, cached after that). From that point on, the agent writes memories when it learns something important, recalls relevant memories when starting new work, and checkpoints its state so it can recover after interruptions. You don't start anything, configure anything, or manage anything — it activates when Claude Code does and the data is there waiting between sessions.

One database can hold multiple isolated memory pools — work projects and personal projects don't bleed into each other, different agent teams can have their own namespace, and you control the boundaries with a single environment variable. There are a bunch of smaller features like this (incognito mode, task tracking, memory supersession, execution checkpoints) that I won't get into here, but the point is: a lot of the "yeah but what about..." problems that came up during real usage have been addressed.

What makes it different from a notes file or a simple database:

**It filters what's worth remembering.** About 30% of what the agent tries to store gets rejected — routine, redundant, trivial stuff never makes it in. This is based on novelty scoring, not just "save everything and hope."

**It retrieves intelligently.** When the agent asks "what do I know about the payment system?", it doesn't load a flat file. It runs a multi-stage pipeline — keyword matching, semantic search, a reranking model that judges passage-level relevance, then walks an association graph to find related memories that weren't in the original query. The right context surfaces for the current task.

**It forms connections.** When two memories get recalled together, a link strengthens between them. Over time, this means recalling one topic can surface related memories that weren't in the original query — not because someone manually linked them, but because they were previously relevant in the same context. The associations take time to build and depend on your usage patterns, but the graph gets richer the more you use it.

**It forgets on purpose.** Unused memories fade over time. Important ones that keep getting accessed stay strong. You don't tag things as important — the system figures it out from how often they come back. This keeps the memory pool lean instead of growing forever.

**It consolidates.** Periodically (like sleep for the brain), the system strengthens clusters of related memories, builds bridges between topics, and archives low-value information. It gets more precise over time, not noisier.

## It Works Alongside What's Already There

AWM doesn't replace Claude Code's built-in memory. It adds the layer that's missing.

Think of it as a stack:
- **CLAUDE.md** — your project's constitution. Always loaded, stable rules and conventions.
- **Auto-memory** — Claude's personal notebook. Quick notes about preferences and patterns.
- **--continue / --resume** — a tape recorder. Replay a previous conversation.
- **AWM** — long-term memory. Learns what matters, forgets what doesn't, surfaces the right thing at the right time.

Each layer handles a different kind of knowledge. They complement each other.

## Real Results

I queried my actual SQLite database to see what's really happening. These aren't benchmark numbers — they're from my day-to-day work across several projects over a few weeks. Your numbers will look different depending on how many projects you're working on, how long your sessions are, and how complex the work is. But the patterns should be similar.

- **225 active memories** — not thousands. The salience filter rejected about 30% of what the agent tried to store (routine observations, near-duplicates, low-value noise). Consolidation archived another handful. A bigger or older project would have more, but the filtering keeps the pool from growing unbounded.
- **2,818 associative connections** between memories — these form automatically. When two memories get recalled together, a link strengthens between them. Nobody designs this graph. It emerges from how the agent actually uses the knowledge. Over 21 consolidation cycles, cross-topic bridges formed, weak links decayed, and hub nodes got normalized so no single memory dominates retrieval.
- **Most-used memory accessed 86 times** — it's a foundational architecture decision that's relevant to almost every session. The temporal decay model (based on ACT-R from cognitive science) means this memory is essentially permanent — each access adds another activation trace that strengthens it against decay. Meanwhile, a one-off debugging note from two weeks ago that was never recalled again is quietly fading toward archive.
- **64.5% fewer tokens** (from our eval suite comparing memory-guided context vs full conversation history) — this is the hidden power of the system and worth explaining. Without AWM, you'd either paste a big context document every session (expensive, often stale) or use `--continue` which loads your entire previous conversation history (very expensive, full of irrelevant back-and-forth). AWM replaces both with *targeted recall* — when the agent starts a task, it recalls only the 5-10 memories most relevant to that specific work. An architecture decision, a related bug fix, a naming convention. Not your entire conversation from yesterday. Not a 500-line project document. Just the signal, no noise. That's where the token savings come from — you're spending context window budget on precisely the knowledge that matters for what you're doing right now, instead of loading everything and hoping the model can find what it needs in a wall of text.

## Multiple Agents, Multiple Tools

This is where it gets interesting. I run multiple AI agents in parallel — one managing tasks, others writing code, another reviewing. They all share the same memory database.

When one agent discovers a bug or an undocumented constraint, it writes that to memory. When a different agent starts working on something related an hour later, it picks up that knowledge automatically. No copy-pasting between sessions. No shared docs to maintain. Knowledge propagates through the team.

And it's not locked to Claude Code. AWM can also run as a standalone HTTP server (`awm serve`) with an API that any tool can call — other AI assistants, CI pipelines, scripts, custom agents. Your memory travels with your project, not your IDE.

## Beyond Code: Other Applications

The same problem — AI that forgets everything between sessions — shows up anywhere you're doing complex, long-running work with an AI assistant.

**Creative writing** is one I keep thinking about. I was talking with an author recently who described exactly the frustration I had with code — their AI assistant would forget character details mid-book, contradict established backstory, and lose track of which clues had been planted where. The more complex the story, the worse it got.

I haven't tested AWM with fiction writing yet, but the mechanics seem like a natural fit. Character details, plot threads, and foreshadowing could form an associative graph — so when the agent writes a scene with a character, it would recall their backstory and relationships. Planted clues would form connections with their eventual payoffs. The "who knew what when" timeline could stay consistent without maintaining a massive spreadsheet. That's the theory, anyway — I'd love to hear from anyone who tries it.

Any field where context accumulates over time — research, legal work, game design, worldbuilding — could benefit from AI that actually remembers.

## Get Started

```bash
npm install -g agent-working-memory
awm setup --global
```

First run downloads about 124MB of ML models (cached locally after that). Everything runs on your machine — no cloud, no API keys, no subscriptions.

It's open source under Apache 2.0. If you're tired of being your AI agent's memory manager, give it a try.

[GitHub](https://github.com/CompleteIdeas/agent-working-memory)

---

*Subreddit suggestions for discussion: r/ClaudeAI, r/ChatGPTCoding, r/LocalLLaMA, r/ArtificialIntelligence, r/SideProject, r/writing (for the creative writing angle)*

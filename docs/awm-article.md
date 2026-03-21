# AgentWorkingMemory: Teaching AI Agents to Remember

*How a cognitive-science-grounded memory system changed the way I work with Claude Code*

---

## The Problem Every AI Power User Knows

If you use AI coding agents daily, you have lived this loop: you open a new session, the agent has no idea what you decided yesterday, you re-explain your architecture, your naming conventions, your half-finished refactor. By the time the agent has enough context to be useful, you have burned ten minutes and a quarter of your context window on things it already knew twelve hours ago.

I hit this wall hard while building the platform, a full-stack platform with 88 database tables, 12 sprint plans, and multiple agents working in parallel. Every new conversation started from zero. I was copy-pasting "resume files" into prompts. It worked, barely — until the resume files themselves became stale, contradicted each other, and needed their own maintenance workflow.

I needed agents that could *remember*.

## What AgentWorkingMemory Is

AgentWorkingMemory (AWM) is a persistent memory system for AI agents. It runs entirely locally — a single Node.js process backed by SQLite and three ONNX machine learning models. No cloud, no API keys, no subscriptions. You install it globally with npm, run a setup command, and restart Claude Code. Thirteen memory tools appear automatically via the Model Context Protocol (MCP).

```bash
npm install -g agent-working-memory
awm setup --global
```

That is the entire setup. From that point on, Claude Code can write memories, recall them in future sessions, track tasks, checkpoint its execution state, and consolidate knowledge over time — all without you managing anything.

But the interesting part is not the installation. It is *how* AWM decides what to remember, what to forget, and how to find what matters.

## Not Another Vector Database

Most "memory for AI" projects are thin wrappers around a vector store: embed everything, retrieve by cosine similarity, hope for the best. They work for demos. They break at scale. After a few hundred memories, every query returns a soup of vaguely related results. There is no mechanism for the system to learn which memories are actually useful, no way for old noise to fade, and no way for cross-topic connections to emerge.

AWM takes a fundamentally different approach, one grounded in decades of cognitive science research on how human memory actually works. The result is a system where:

- **77% of incoming information is filtered at write time** — only novel, surprising, or causally significant events are stored
- **Memories decay naturally** — unused knowledge fades, frequently-accessed knowledge persists
- **Associations form organically** — memories recalled together develop stronger links
- **Periodic consolidation prunes noise and builds bridges** — like sleep does for the human brain
- **Feedback from the agent tunes the system** — useful memories gain confidence, irrelevant ones lose it

In the A/B evaluation, AWM stored only 23 of 100 project events yet achieved 100% recall accuracy on 24 test questions. The keyword baseline stored everything and still only hit 83%. Less is more, when the "less" is the right stuff.

## The Cognitive Science Inside

AWM does not use cognitive science as a metaphor. It implements specific, well-studied mechanisms from the memory research literature. Understanding these illuminates why the system works the way it does.

### ACT-R Activation Decay (Anderson, 1993)

Every memory in AWM has an activation level that decays as a power law of time since last access. The formula is simple: `decay = t^(-d)`. Memories you accessed yesterday are more retrievable than memories from last month. But critically, *each access creates a new time trace*. A memory accessed five times decays five times more slowly than one accessed once.

This means the system naturally learns what matters through usage patterns. You do not tag memories as "important" — the ones you keep coming back to stay alive on their own.

### Hebbian Learning (Hebb, 1949)

"Neurons that fire together wire together." When AWM retrieves two memories in the same recall operation, it strengthens a weighted edge between them. Over time, retrieving a memory about "Express middleware" naturally pulls in related memories about "error handling" and "route guards" — because those topics were previously recalled together in context.

These associative edges create an emergent knowledge graph. Nobody designs the topology. It grows from actual usage. And edges that stop co-firing weaken over consolidation cycles, so stale associations do not persist forever.

### Complementary Learning Systems (McClelland et al., 1995)

The brain uses two systems for learning: the hippocampus captures specific episodes quickly, and the neocortex slowly consolidates them into generalized knowledge. AWM mirrors this with a fast-capture path and a slow-consolidation path.

**Fast capture**: Every write passes through a salience filter that scores novelty, surprise, causal depth, and effort. High-salience memories go directly to active storage. Borderline ones enter a staging buffer — the system's "hippocampal" holding area. Low-salience events (routine, redundant, trivial) are discarded immediately. This is how 77% of writes get filtered out before they ever enter the memory pool.

**Slow consolidation**: Periodically (and automatically on session end), AWM runs a seven-phase "sleep cycle" that replays memory clusters, strengthens frequently co-accessed edges, builds bridges between previously separate topics, applies temporal decay, normalizes hub weights, archives low-value memories, and sweeps the staging buffer. After a single sleep cycle, cross-topic recall improved from 50% to 83% in testing.

### Synaptic Homeostasis (Tononi and Cirelli, 2003)

Without active regulation, popular memories would become gravitational attractors — connected to everything, surfacing for every query, drowning out the actual answer. AWM prevents this with homeostatic normalization: after each consolidation cycle, hub nodes have their outgoing edge weights scaled down proportionally. Strong connections survive. Weak, diffuse connections attenuate. The signal-to-noise ratio improves with every cycle.

### Forgetting as a Feature (Anderson and Bjork, 1994)

Perhaps the most counterintuitive design choice: AWM is *designed to forget*. Memories with low confidence, low access count, and old last-access timestamps are archived during consolidation. They are removed from active retrieval but preserved in storage for forensic purposes.

This is not a bug. Forgetting reduces interference. When you remove noise from the retrieval pool, the memories that remain have cleaner paths to each other. The system gets *more accurate* as it forgets, not less.

## The 10-Phase Retrieval Pipeline

When an agent calls `memory_recall`, the query passes through ten phases before results are returned. This is where AWM's precision comes from — it is not just "find similar vectors."

| Phase | What Happens |
|-------|-------------|
| 1. BM25 Text Search | Full-text search on concept and content using SQLite FTS5 |
| 2. Semantic Search | Cosine similarity on 384-dimensional embeddings (MiniLM-L6-v2) |
| 3. Score Fusion | Weighted merge of lexical and semantic candidates |
| 3.5. Rocchio Expansion | Pseudo-relevance feedback: expand query with top-3 terms, re-search |
| 3.7. Entity-Bridge Boost | Boost candidates sharing entity tags with top text matches |
| 4. Cross-Encoder Rerank | ms-marco-MiniLM scores passage-level relevance (not just embedding distance) |
| 5. Temporal Decay | ACT-R power-law decay based on time since last access |
| 6. Graph Walk | Beam search over Hebbian and temporal edges |
| 7. Confidence Gating | Filter by confidence threshold, apply feedback bonus |
| 8. Z-Score Normalization | Model-agnostic score normalization for consistent ranking |

The combination of lexical search (exact keywords), semantic search (meaning), cross-encoder reranking (passage-level judgment), temporal decay (recency), and graph walk (associations) means the pipeline handles queries that no single technique could. A keyword search would miss semantic paraphrases. A pure vector search would miss exact terms. Neither would account for recency or associative context. AWM uses all of them.

## The 7-Phase Consolidation Cycle

Consolidation is AWM's "sleep." It runs automatically on session end (via a Claude Code hook) and can be triggered manually. The seven phases:

| Phase | What Happens |
|-------|-------------|
| 1. Replay | Identify memory clusters based on co-access patterns |
| 2. Strengthen | Boost edges between frequently co-accessed memories |
| 3. Bridge | Create cross-topic edges between related clusters |
| 4. Decay | Apply time-based decay to all edge weights |
| 5. Homeostasis | Normalize hub weights to prevent domination |
| 6. Forget | Archive low-confidence, low-access memories |
| 6.5. Redundancy Prune | Archive semantically similar (>0.85) low-confidence duplicates |
| 7. Sweep Staging | Promote or discard memories in the staging buffer |

The consolidation cycle is what makes AWM improve over time rather than degrade. Without it, the memory pool would grow monotonically, associations would calcify, and hub nodes would dominate retrieval. With it, the system actively maintains its own health.

## Multi-Agent Shared Memory

Here is where AWM became transformative for my workflow. In the the platform project, I run multiple Claude Code agents in parallel — an orchestrator that assigns tasks, coding workers that implement features, reviewers that audit code. They all read and write to the same AWM database.

When Worker-A discovers that a particular API endpoint has an undocumented constraint, it writes that to memory. When Worker-B starts working on a feature that touches that endpoint an hour later, it recalls the constraint automatically. No Slack messages, no shared docs, no human relay.

The `AWM_AGENT_ID` environment variable controls memory namespacing. Agents sharing the same ID share memory. Agents with different IDs have isolated pools. For the platform, all agents share one pool — cross-pollination is more valuable than isolation.

Memory pools can also be scoped by directory. Drop a `.mcp.json` with a different `AWM_AGENT_ID` in each project folder, and Claude Code automatically uses the closest ancestor config. Work projects and personal projects stay separate without any manual switching.

## Hooks: The Invisible Infrastructure

AWM's hook system is what makes the memory lifecycle automatic rather than manual. Installed by `awm setup --global`, the hooks integrate directly with Claude Code's lifecycle events:

**Stop Hook** — After every agent response, a gentle nudge reminds the agent to write or recall memories if appropriate. This is what keeps the agent writing memories during active work, not just at session boundaries.

**PreCompact Hook** — Before Claude Code compresses the conversation context (when it approaches the context window limit), AWM automatically checkpoints the agent's execution state. When the agent resumes after compaction, `memory_restore` recovers the checkpoint and recalls relevant context. The agent picks up where it left off without knowing compaction happened.

**SessionEnd Hook** — On graceful exit, AWM checkpoints state and runs a full consolidation cycle. This is the "sleep" that strengthens clusters, builds bridges, and prunes noise.

**15-Minute Timer** — A silent background checkpoint every 15 minutes ensures that even long sessions do not lose state if the process crashes.

The hook sidecar is a lightweight HTTP server running on a separate port inside the AWM process. It handles checkpoint requests, serves activity stats, and manages the timer — all without interfering with the MCP tool pipeline.

## Benchmarks: Trust but Verify

AWM ships with seven reproducible evaluation suites. Every benchmark creates a fresh database, seeds test data, runs structured challenges, and reports pass/fail. No cherry-picked examples.

| Evaluation | Score | What It Proves |
|-----------|-------|---------------|
| **Edge Cases** | 100% (34/34) | Survives 9 adversarial failure modes: hub toxicity, flashbulb distortion, narcissistic interference, identity collision, noise forgetting benefit |
| **Stress Test** | 92.3% (48/52) | Handles 500 memories, 100 sleep cycles, catastrophic forgetting scenarios, adversarial spam |
| **A/B Test** | AWM 100% vs Baseline 83% | Beats keyword/tag matching on semantic queries across 100 events |
| **Self-Test** | 97.4% (31 checks) | All pipeline components function correctly in isolation |
| **Real-World** | 93.1% (15/16) | Accurate retrieval against 300 chunks from a 71K-line production monorepo |
| **Workday** | 86.7% (12/14) | Cross-session recall across 4 simulated work sessions, 43 memories |
| **Token Savings** | 64.5% reduction | Memory-guided context uses 35.5% of tokens vs full conversation history |

The edge case suite is particularly revealing. It tests failure modes that would break naive vector stores: a single mega-hub memory connected to everything (homeostasis prevents domination), a high-salience flashbulb memory overshadowing related quiet ones (confidence gating preserves the quiet ones), contradictory memories existing simultaneously (the system surfaces both with appropriate confidence scores). These are not theoretical concerns — they are failure modes I hit with earlier approaches.

## Production Numbers: What a Real Database Looks Like

Benchmarks are controlled experiments. Production is messier. Here is what my actual AWM database looks like after weeks of daily use across the the platform project and several personal projects:

| Metric | Value | What It Means |
|--------|-------|---------------|
| **Active memories** | 225 | Survived salience filtering and consolidation |
| **Total edges** | 2,818 | Associative connections between memories |
| **Hebbian edges** | 1,163 | Formed from co-retrieval (41% of all edges) |
| **Write rejection rate** | ~30% | Salience filter discarding noise at write time |
| **Mean retrieval score** | 0.736 | Average relevance score for recalled memories |
| **Top memory access count** | 86× | Most-accessed memory has been recalled 86 times |
| **Consolidation cycles** | 21 | Full sleep cycles completed |
| **Hook events** | 3,668 | Auto-checkpoints, stop-hook nudges, session ends |

225 memories. Not 2,250. Not 22,500. The salience filter and consolidation keep the pool focused. With 2,818 edges connecting them, the average memory has ~12 associative links — enough for rich graph walks without hub domination.

The 86× access count on the top memory tells you something about real-world usage patterns: a small number of foundational memories (architecture decisions, naming conventions, database schemas) get recalled constantly. ACT-R decay ensures these stay permanently retrievable while one-off debugging notes fade naturally.

3,668 hook events means the lifecycle machinery is working — checkpoints fire on schedule, stop-hooks nudge the agent to write after responses, session-end triggers consolidation. The system runs itself.

## Honest Shortcomings

AWM is not perfect, and the production data makes that clear. Three issues stand out:

**Zero feedback and zero retractions.** The database shows 0 `memory_feedback` calls (useful/not-useful) and 0 `memory_retract` calls (correcting wrong memories). This means the feedback loop — one of AWM's most important theoretical mechanisms — is not being used in practice. Confidence scores are stuck at the default 0.5 for every memory. The system cannot learn which memories are actually helpful because the agent never tells it.

This is partly a prompt engineering problem (the agent needs stronger nudges to call `memory_feedback` after using a recalled memory) and partly a workflow gap (retraction requires the agent to notice that a memory is wrong, which is harder than it sounds). The infrastructure exists and works — it just is not being exercised. This is the single biggest gap between AWM's design and its real-world behavior.

**Staging buffer is empty.** The complementary learning systems design sends borderline-salience memories to a staging buffer for later evaluation. In practice, the staging buffer is consistently empty. This suggests the salience filter's thresholds are too binary — memories either pass clearly or get discarded, with nothing landing in the middle. The staging-to-promotion pathway, while architecturally sound, is not contributing in practice.

**Consolidation is gentle.** After 21 consolidation cycles, no memories have been archived or forgotten. The decay and forgetting thresholds may be too conservative for a pool of only 225 memories. With a larger pool (thousands of memories), the forgetting mechanisms would likely activate more aggressively. At current scale, everything survives.

These are real limitations, not theoretical risks. They point to the next round of tuning: stronger feedback nudges, recalibrated salience thresholds, and more aggressive consolidation parameters for small pools.

## Why Not Just Use Obsidian (or a Notes File)?

A fair question. You could maintain a markdown file of project notes and paste it into every conversation. Some people use Obsidian vaults with AI plugins. Why build a whole cognitive memory system?

The difference is in what happens automatically versus what requires human effort:

| Capability | Manual Notes / Obsidian | AWM |
|-----------|------------------------|-----|
| **What gets stored** | Everything you remember to write down | Automatic salience filtering — 70%+ of noise discarded at write time |
| **What gets retrieved** | Whatever you search for or remember exists | 10-phase pipeline retrieves what's *relevant*, not just what matches keywords |
| **Staleness** | Notes rot silently — you discover they're wrong when the agent acts on them | Temporal decay naturally deprioritizes old, unused information |
| **Connections** | You manually link notes or hope for backlinks | Hebbian edges form automatically from co-retrieval patterns |
| **Maintenance** | You prune, reorganize, update — or it degrades | Consolidation cycle prunes, strengthens, bridges automatically |
| **Cross-session** | You paste the right notes into each session | `memory_restore` loads relevant context automatically |
| **Multi-agent** | You copy notes between agent sessions manually | Shared database — all agents read and write the same pool |
| **Forgetting** | You delete notes manually, or they accumulate forever | Adaptive forgetting archives low-value memories, improving retrieval precision |

The core difference: manual systems require you to be the memory manager. AWM makes the *agent* the memory manager, using mechanisms that handle the tedious parts (filtering, linking, decaying, consolidating) without human intervention.

Obsidian is a great tool for *human* knowledge management. AWM is purpose-built for *agent* knowledge management — where the "user" is an LLM that can call structured tools but cannot browse a file tree or remember to check its notes.

## The Personal Angle: What Actually Changed

Before AWM, every Claude Code session began with me loading context. I would paste architecture notes, remind the agent about naming conventions, point it at the right files, re-explain decisions made weeks ago. The agent was competent but amnesiac.

After AWM, conversations start differently. I open a session, the agent runs `memory_restore`, and within seconds it knows: the project uses Zod for validation, the database migration numbering hit a conflict at 072, the organizer manage pages live in the `(portal)` route group not a separate `(manage)` group, Sprint 02 is complete with 210 tests passing, and there is a merge freeze decision pending.

I do not re-explain. I say "continue the stabling fee implementation" and the agent recalls the pricing rules, the relevant database tables, the Stripe integration pattern from last week, and the test file it was halfway through writing.

The token savings are real too. Instead of stuffing the context window with conversation history, AWM provides focused, relevant memories that use 64.5% fewer tokens. That is context window budget I can spend on actual code instead of background information.

But the biggest change is with multi-agent workflows. When I have three agents working in parallel — one building API routes, one writing frontend components, one reviewing code — they share a common memory pool. Discoveries propagate. If the API agent finds that a database function has an edge case with null horse registrations, the frontend agent picks that up when it starts building the form validation. No human relay required.

## What AWM Is Not

AWM is not a replacement for your source of truth. Code lives in git. Specs live in docs. Tickets live in your tracker. AWM remembers the *context around* those artifacts — the decisions, the surprises, the patterns, the corrections — that make an agent effective without starting from scratch.

It is not a chatbot UI. It is not a hosted service. It is not a generic vector database with a cute name. It is a specific, opinionated system built for one purpose: making AI coding agents retain useful knowledge across sessions, using mechanisms borrowed from how human memory actually works.

## Beyond Claude Code: Any Agent, Any Tool

AWM connects to Claude Code via MCP, but that is not its only interface. It also runs an HTTP API on port 8400 that any tool can call — Codex, Cursor, Windsurf, CI pipelines, shell scripts, custom agents. Same brain, different frontends.

This matters because most memory solutions are locked to a single tool. Claude Code's built-in auto-memory only works in Claude Code. Cursor's memory only works in Cursor. If you switch tools, or use multiple tools on the same project, your memory stays behind.

AWM's HTTP API makes memory tool-agnostic. Write a memory from a CI pipeline when a deploy fails:

```bash
curl -X POST http://localhost:8400/memory/write \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-project",
    "concept": "Deploy failure: staging 2026-03-20",
    "content": "PostgreSQL migration 078 failed — column type mismatch on event_status. Fixed by casting varchar to enum in migration.",
    "eventType": "causal",
    "surprise": 0.8,
    "causalDepth": 0.7
  }'
```

Recall relevant context from any script or agent:

```bash
curl -X POST http://localhost:8400/memory/activate \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-project",
    "context": "PostgreSQL migration errors on staging"
  }'
```

The response includes the full 10-phase retrieval pipeline — BM25, semantic search, reranking, temporal decay, graph walk, the whole thing. A Codex agent running in a different terminal gets the same quality retrieval as Claude Code running via MCP. The memories are the same, the edges are the same, the consolidation is the same.

In practice, this means you can:
- Run Claude Code for feature work and Cursor for debugging — both read/write the same memory pool
- Have a CI pipeline write deployment outcomes that agents recall during future troubleshooting
- Build custom agents (Python, Go, whatever) that participate in the shared memory without any SDK dependency — just HTTP calls
- Use `awm serve` as a standalone memory server for non-Claude workflows

The `AWM_AGENT_ID` parameter on every request controls namespacing. All tools sharing the same ID share memory. Different IDs get isolated pools. You choose the boundary.

## Getting Started

```bash
npm install -g agent-working-memory
awm setup --global
# Restart Claude Code
```

First run downloads ~124MB of ML models (cached locally). After that, everything is local. The database, the models, the embeddings, the consolidation — all on your machine.

If you are running Claude Code for anything beyond one-off questions, AWM will change how you work. Not because it is magic, but because it solves the most fundamental friction in human-AI collaboration: the agent forgetting everything you taught it the moment the session ends.

---

*AWM is open source under Apache 2.0. Current version: 0.5.0.*

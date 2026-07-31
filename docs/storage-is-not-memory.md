# Storage is not memory

*I spent a week running my open-source agent memory system through every benchmark that's supposed to measure it. The numbers were a surprise — not because they were good or bad, but because they were measuring the wrong thing.*

---

## What I built and what I expected

I maintain a project called **AWM** (Agent Working Memory). It's an open-source memory layer for AI agents — local SQLite, ONNX embeddings, BM25 + vector + cross-encoder reranker, salience filtering, Hebbian-style associations, and a consolidation engine that runs while the agent is idle. It's used in production by an internal support agent that triages Freshdesk tickets, queries a 25-year-old legacy SQL Server database, looks up USEF/USEA member records, and writes its findings back so the next agent doesn't have to re-derive them.

It's been running every day for months. The team is happy with it. The agent — `gpt-5.4-mini` behind an Azure OpenAI deployment, for cost reasons — handles tickets that would otherwise sit in someone's queue.

So I figured I should benchmark it.

I picked the best-known memory benchmarks for agentic systems: **LoCoMo** (Multi-Session Chat from Snap Research), **LongMemEval** (the ICLR 2025 benchmark for long-term memory), and the **Letta Leaderboard** (which Letta — formerly MemGPT — publishes against their own architecture). All three are widely cited. Letta reports 74.0% on LoCoMo. Mem0 reports 68.5%. The Zep blog calls these "state-of-the-art."

What followed was a week of building adapters, running thousands of LLM calls, debugging rate limits, watching my OpenAI quota disintegrate, and watching AWM land at **48.8%** on the same dataset where Letta hits 74%.

If you stopped reading there, the obvious conclusion would be: AWM is behind. The market leaders have a 25-point lead, time to catch up.

But here's the thing. After a week of staring at the data — including the experiments that *worked* and the ones that didn't — I came out the other side with a different question:

**What if these benchmarks aren't measuring memory at all?**

## Storage and memory are not the same thing

Let me state the distinction plainly, because it explains everything that follows.

**Storage** is "everything you wrote is here; you can find it later." A database is storage. Object storage is storage. A vector index over your last six months of Slack messages is storage. You can ask it questions and it returns the most relevant chunks. The design intent is: *don't lose anything; surface whatever is asked for*.

**Memory** is something different. Memory is selective by design. Your brain doesn't store every visual frame you saw today; it stores the ones that mattered, and it gets better at not-remembering as you get older. Memory filters at write time, consolidates while idle, decays what isn't reinforced, and surfaces what's salient *to the situation you're in*.

A photo album is storage. Knowing not to bring up your sister's ex at Thanksgiving is memory.

In software, the difference between them is whether the system is *deciding what not to store*. Storage doesn't decide; it accepts. Memory decides; it filters. They look superficially similar — both have a write operation, both have a retrieval operation, both can be queried — but they're solving different problems with different success criteria.

I built AWM around the memory side of that line. Salience filtering at write time. Confidence floors that vary by memory class — *canonical* for stable invariants, *working* for findings, *ephemeral* for short-lived context. A consolidation engine that strengthens used memories and decays unused ones. Prefix-tag retrieval that rewards writers who tag their memories with structured metadata (`proj=`, `topic=`, `intent=`, `person=`, `date=`).

Letta took a different path. Letta's archival memory is **a file system**. When the agent wants to remember something, it writes it to a file. When the agent wants to recall, it uses a `search_files` tool, and that tool returns *entire files* — typically 5-15KB of conversation history per search call. Their `chunking_strategy="session"` means each conversation session becomes one file.

Mem0 does something else: it uses an LLM at write time to extract memories, then stores them with metadata for later retrieval. The extraction is aggressive; it captures a lot of what's said.

These are different design points. They're all reasonable, and they're all in production somewhere. But they're aimed at different problems.

## What the benchmarks reward

LoCoMo is a corpus of long multi-session conversations between two people, paired with questions like:

> "When did Caroline join the LGBTQ support group?"
> "What does Melanie think about her new apartment?"
> "How long ago was Calvin's 18th birthday?"

The benchmark grades whether the memory system can reconstruct facts mentioned earlier in the conversation. A reader LLM (typically `gpt-4o-mini` in the published results) gets the recalled context and writes an answer. A judge LLM (typically `gpt-4.1`) compares to a gold answer.

I built an adapter that runs Letta's exact harness with AWM as the backend. Same prompt, same reader, same judge. Same dataset: 1,540 non-adversarial questions across 10 conversations.

AWM scored **48.8%**.

Letta hits 74%. Mem0 hits 68.5%. AWM is ~25 points behind both.

Here's the part that took me a week to see: **AWM hit 48.8% with all of its memory features turned off.**

## What "turned off" actually means

When I wrote the LoCoMo adapter, my first version dumped every conversation turn into AWM as a separate memory. Each turn got two tags: `sid=session_3` and a (broken — I discovered this later) date tag. That's it. No `proj=` tag, no `topic=` tag, no `intent=` tag, no `person=` tag — none of the semantic prefix metadata that AWM's retrieval boost is built to reward.

I didn't run consolidation. The Hebbian edge-strengthening that AWM does in the background while the agent is idle — that runs on a 30-second timer when the coordinator is up, but in the benchmark environment it never had a reason to fire. Zero episodes recorded across the 10 agents. Zero edges between memories.

So when AWM scored 48.8%, what it actually scored on was:

- BM25 keyword matching over the engram text
- Vector similarity from the bundled `bge-small-en-v1.5` embedding model
- A cross-encoder reranker (`ms-marco-MiniLM-L-6-v2`) over the top candidates

That's it. The whole salience-filter, consolidation, prefix-tag, entity-bridge, decay-curve apparatus — none of that fired. AWM was running as a vanilla text + vector retriever.

And it still answered nearly half the benchmark correctly.

Then I doubled the recall limit, top-10 to top-20 results returned per search. The number went to **52.7%** (+3.9pp). Doubling the bandwidth helped — but the lift, while real, was modest.

Then I tried making AWM act more like Letta: one engram per session instead of one per turn, so each "memory" is 5-15KB of context like Letta's files. **27.6%**. Worse. Significantly worse. Giving the reader more context per recall *increased* its abstention rate from 24% to 45%. The reader got confused by the noise and started saying "I don't have that information."

Then I tried an LLM-writer pass: `gpt-4o-mini` reads each session and extracts 5-7 structured memories per session, the way Mem0 and Letta both effectively do. **46.9%**. Within 2 points of the raw-dump baseline. The writer compressed information lossy-ly — helped on temporal lookups (+5pp) and single-hop facts (+2pp), hurt on multi-hop synthesis (-7pp) — and netted out roughly the same.

I sampled 100 of AWM's wrong answers and re-ran the recall to diagnose: **66% were retriever-coverage failures** (the gold answer simply wasn't in the top-10 returned memories) and only **30% were LLM extraction failures** (the answer was there but the reader picked the wrong piece). For the temporal category alone, retriever-failure was 84%. AWM was missing the right turn.

I should have realized then that I was holding the wrong instrument. There were knobs I could turn that would close some of the gap — a wider recall pool, richer write-time tagging, forced consolidation — and they probably *would* close it, partially. But each knob made AWM act more like storage. Bigger context per recall. More memories surfaced. Less filtering. The more I optimized for the benchmark, the less my system looked like the thing I'd designed.

And then the part that should have told me something earlier:

## The one category AWM crushed

LoCoMo has five question categories. Four of them — single-hop, multi-hop, temporal, open-domain — are "can you find the answer in the conversation?" questions. The fifth category is **adversarial**.

Adversarial questions ask things like: "When did Caroline say she met her husband?" — but Caroline never mentioned a husband, and you, the memory system, should refuse to make something up.

Letta excludes adversarial from their published 74% number. So does most of the leaderboard. Adversarial is reported separately, when it's reported at all.

On adversarial, AWM scored **86.8%**.

That's the highest adversarial number I've found from any local-first memory system in the published literature. The system that supposedly couldn't reconstruct the answer to questions where the answer exists — turned out to be excellent at *refusing to invent answers when the answer didn't exist*.

Which is exactly what a memory system, as opposed to a storage system, is supposed to do.

## The reader is the variable; memory is the constant

I ran AWM on LongMemEval (a different benchmark, single-session-user category) with four different reader LLMs. Same memory, same retrieval, same recall budget. Only the LLM changed.

| Reader | Type | Accuracy |
|---|---|---|
| `gpt-4o-mini` | Cheap, non-thinking | 68% |
| `gpt-4o` | Strong, non-thinking | 68% |
| `o4-mini` | Cheap, thinking | 78% |
| `gpt-5-mini` | Mid, thinking | 80% |

Non-thinking models capped at 68% no matter how much I spent on them. The reasoning models picked up 10-12 points on the same retrieved context.

This is the pattern that storage-style systems hide. When the system gives the reader 15KB of conversational substrate per recall call, the reader's quality matters less because the answer is probably literally in the dump and a half-decent model can find it. When the system gives the reader 10 curated memories totaling 2KB, the reader has to *reason over them*, and that's where reasoning capability shows up as accuracy.

AWM-with-thinking-reader is already in Mem0's range on this benchmark. AWM-with-cheap-reader is below it. The takeaway isn't "use expensive readers." It's: **the bytes-per-recall-call number is the architecture choice that determines whether the LLM is doing retrieval-comprehension or substring matching.**

Memory systems should put the reasoning on the reader. Storage systems put the reasoning on the LLM-summarizing-the-dump.

## Production: where the rubber meets the road

The USEA Agent — the thing AWM is actually built for — runs on `gpt-5.4-mini` behind an Azure OpenAI deployment. It handles support tickets, queries a legacy SQL Server database, looks up member and horse records, drafts triage notes for human staff, and writes its findings back to AWM for the next agent or session.

Its `/health` endpoint reports a `retrievalPrecision` metric — the fraction of recalls where the returned memories were rated useful by downstream feedback signals. Over the last month: **75%**.

Of the 337 production tasks captured in the last sample window:

- **18%** invoke a `recall_memory` tool call at all.
- **0%** make more than one recall call per task. Not 0.1%. Zero.
- Average iterations per task: 1.33. Most tasks are simple one-shot lookups; the harder ones touch 3-5 tools.

In other words: the agent that actually uses AWM in production touches memory **selectively, sparingly, and never twice on the same task**. That's not a failure of the memory system — that's *exactly the design intent of memory*. You recall when you need to, you don't recall when you don't, and when you recall, you trust the result enough to act on it.

If AWM were a storage system, those numbers would be much higher. Agents using a storage system tend to over-retrieve — every task triggers a recall, every recall triggers a follow-up search, and the context window fills with material that isn't load-bearing for the answer. That's not memory; that's a research assistant who hands you the entire library every time you ask a question.

The article-relevant comparison:

| | Benchmark setup | Production setup |
|---|---|---|
| Reader | `gpt-4o-mini` (cheap) | `gpt-5.4-mini` (cheap, reasoning variant) |
| Task | Reconstruct chatbot small talk | Triage Freshdesk tickets, query DBs, look up members |
| Recall coverage | Forced on every question | 18% of tasks |
| Multi-recall | Encouraged | 0% of tasks |
| Score | 48.8% | 75% retrievalPrecision |

The benchmark score is *lower* than the production score on the same memory system. Read that again. The numbers aren't directly comparable — different metrics, different task shapes — but they tell you something real: **memory works better on real work than it does on chatbot small talk**.

This isn't surprising. Real work has structure. There are entities (ticket IDs, member IDs, dates, SQL table names). There are intents (this is a finding, this is a decision, this is a TODO). There are stakeholders whose decisions matter more than their preferences. A memory system that filters for those and tags them appropriately retrieves them well later. Conversation small talk has none of that — it's all flat, all the same shape, and the way to "win" the benchmark is to keep all of it.

That's storage. That's what storage is for.

## Why this matters

Two reasons.

**One**: if you're building an agent and you're shopping for a "memory" system, you're probably looking at the LoCoMo leaderboard, the Mem0 marketing, the Letta Leaderboard, or one of the half-dozen comparison posts on Medium. Those leaderboards are measuring storage. They're measuring "if I dump a year of conversational context into your system, how much of it can you regurgitate?" That's a real and useful thing to measure — if you're building a chatbot that needs to remember small talk from six months ago.

If you're building a productivity agent — one that does customer support, code review, sales research, financial analysis — what you actually need is the opposite. You need the system to know which 5 facts out of 5,000 matter for the question in front of it, and to surface those five. The systems that optimize for the leaderboard score are optimizing for hoarding. Hoarding is a different design constraint than knowing.

**Two**: the design choices compound. Storage-style systems want the LLM to do the heavy lifting at read time. They dump big context. They benefit from longer context windows and stronger models. They get more expensive as your data grows. Memory-style systems do the work at *write* time — salience filtering, tagging, consolidation, decay. They want the LLM to be free of decisions about what's important; they make those decisions structurally. They benefit from cheap reasoning models. They get *cheaper* as your data grows, because the filter does its job.

If you optimize for the LoCoMo benchmark, you build Letta. If you optimize for "agent finishes the ticket without burning $0.40 in tokens," you build something different.

## What we should benchmark instead

I'm not going to pretend I have a clean answer here. Building a memory benchmark that measures memory-as-distinct-from-storage is a real research problem and one I'm chewing on. But I think the axes look something like:

1. **Task completion on real workflows.** Not reconstructive QA. Did the agent finish the ticket? Did the code review surface the bug? Did the sales rep get the right cite? Measured against a fixed cheap reader — not the best model you can afford.

2. **Token efficiency.** How many input tokens did the agent burn to complete the task? Storage systems use more; memory systems use fewer. Cost per resolved task is a real number that real businesses care about.

3. **Selectivity.** What fraction of tasks invoke recall at all? What fraction multi-recall? A memory system in production should look like the USEA numbers — 18% of tasks need recall, 0% need it twice. If your "memory" system is being touched on every turn, it might be storage with a different name.

4. **Update fidelity.** When a fact changes — a member's address, a database schema, a user's preference — does the system actually update, or does it accumulate stale variants of the same fact? Memory systems retract and supersede. Storage systems collect.

5. **Off-topic resistance.** Does irrelevant memory leak into the agent's response? When the user asks "what's the status of ticket 18360?" does the agent get distracted by an unrelated memory of a coffee shop conversation from three months ago? Storage systems do this. Memory systems shouldn't.

None of those are LoCoMo. None of those are LongMemEval. They're not the kinds of axes you can measure with a 2024 conversational QA dataset, because the chatbot benchmarks were designed to test a different property — and they test it well, for the systems built around that property.

## What I'm telling people now

If somebody asks "how does AWM compare to Letta?" the honest answer is: **AWM and Letta are not the same kind of system.** Letta is a great storage layer for conversational agents. Mem0 is a good extraction-and-storage system for the same use case. AWM is a memory layer for productivity agents. They overlap, but the overlap is smaller than the leaderboards suggest.

If you're building a chatbot that needs to remember small talk: use Letta or Mem0. They're optimized for it; they're good at it.

If you're building a productivity agent that needs to stay on-topic, remember decisions, find the right schema lookup from six months ago, and not burn tokens hallucinating context that doesn't matter: AWM is the design point I'd recommend. (I'd say that even if I hadn't written it.)

The benchmark numbers are real. They tell you something. They just don't tell you what the leaderboards think they tell you.

Storage is solved. We have FAISS, pgvector, every cloud vendor's RAG service, and a dozen agent frameworks layered on top. The next frontier — the harder problem — is **memory**. Selective. Structural. The kind that gets *better* by remembering less.

And we need new benchmarks for it.

---

*AWM is open source. The benchmark adapters used in this article are in the [AgentSynapse repo](https://github.com/CompleteIdeas/agent-synapse) under `packages/awm/tests/letta-locomo/`. The raw results — every prompt, every response, every grade — are in the commit history. If you want to replicate any of these numbers, the harness is yours.*

*Disclosure: I wrote AWM. I'm not neutral. I tried to make the numbers in this article hard for me — running AWM with its features turned off, reporting the negative experiments, naming the gap honestly. The published numbers from Letta, Mem0, and Zep are from their own blogs and papers; I haven't re-run their systems.*

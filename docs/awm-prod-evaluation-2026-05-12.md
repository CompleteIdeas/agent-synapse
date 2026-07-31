# AWM Production Evaluation — 2026-05-12

**Method:** first-class-delivery 6-phase loop. Read-only snapshot of `/app/data/memory/usea-agent.db` on `usea-agent-vm` (Azure VM, RG `usea-ai`). No mutations.

**Question Robert posed:** Step back. Evaluate what the agent is actually storing. Identify good connections and bad connections. Find logical improvements without causing regressions in other areas.

## Phase 1 — Ground (what the database actually contains)

| Metric | Value |
|---|---|
| Total engrams | 1,506 |
| Distinct agents | 1 (`usea-agent`) |
| memory_class: canonical | 776 |
| memory_class: working | 730 |
| memory_class: ephemeral | 0 |
| memory_type: unclassified | 843 (56%) |
| memory_type: semantic | 640 (42%) |
| memory_type: procedural | 22 |
| memory_type: episodic | 1 |
| **Hebbian associations (edges)** | **0** |
| **Consolidation episodes (syntheses)** | **0** |
| Oldest engram | ~2026-04-21 (DB is ~3 weeks old) |
| Peak day | 2026-05-11, 486 writes (Freshdesk triage session) |

**Tag distribution (top, including the unprefixed bucket):**

| Tag (token) | Count |
|---|---|
| `canonical` (raw word) | 681 |
| `legacy_db_query` (raw) | 527 |
| `agent-output` (raw) | 493 |
| `proj=*` (prefix) | 449 |
| `conf=*` (prefix) | 449 |
| `schema` (raw) | 381 |
| `table=*` (prefix) | 376 |
| `topic=*` (prefix) | 300 |
| `recall_memory` (raw) | 294 |
| `intent=*` (prefix) | 289 |
| `reflection` (raw) | 260 |
| `auto-generated` (raw) | 260 |
| `freshdesk_get_ticket` (raw) | 231 |
| `friction` (raw) | 162 |
| `ticket=*` (prefix) | 159 |

**Prefix coverage by age window:**

| Window | Engrams | Tags | Prefixed | Raw | %prefixed |
|---|---:|---:|---:|---:|---:|
| ≤ 7 days | 555 | 3,502 | 1,911 | 1,591 | **54.6%** |
| 7–30 days | 951 | 3,176 | 161 | 3,015 | **5.1%** |

**Memory type by age:**

| Window | unclassified | semantic | procedural | episodic |
|---|---:|---:|---:|---:|
| ≤ 7 days | 213 (38%) | 342 (62%) | 0 | 0 |
| 7–30 days | 630 (66%) | 298 (31%) | 22 | 1 |

**Read:** the enrichTags patch deployed last week is doing exactly what it was designed to do. Prefix coverage jumped 5% → 55%, classified types jumped 34% → 62%. **Half the production corpus is pre-patch noise.**

## Phase 2 — Orient (what the data tells us)

### Six observations, with evidence

**1. The Hebbian graph is empty.** ConnectionEngine is instantiated in `EmbeddedAWM` constructor (`embedded-awm.ts:144`) but `recall()` never calls `connections.recordCoActivation(...)`. So when memories are co-activated by a query, nothing strengthens an edge between them. The "fires together wires together" loop is structurally disconnected. **0 / 1,506 engrams have edges.**

**2. Consolidation produces no episodes.** The scheduler IS started (`embedded-awm.ts:150`) on a 5-minute interval. But `consolidation.consolidate()` produces 0 syntheses on this corpus. Likely root cause: with 0 associations and salience features all hard-coded to `0.3` (`embedded-awm.ts:214-220, 247-254, 296-302`), the cluster-formation step can't find anything to synthesize. The salience engine is operating on uniform inputs.

**3. Recursive self-references are bloating the corpus.** Three different canonical engrams share concept "Schema: INFORMATION_SCHEMA columns" with content beginning `"Discovered columns for INFORMATION_SCHEMA: Found 5 matching memories (of 222 total): --- Memory 1 (score: 15.0)..."`. **The agent is storing its own recall output as a new memory.** Each subsequent recall+write creates a slightly different duplicate. No upsert/dedup at the write path. This is the production analog of LoCoMo's "Caroline noise" — repeated, near-identical content drowning signal.

**4. The `concept` field is mostly noise.** Sampled values include `"Task: # Recent Conversation User: Lets update this record properly"` and `"Task: # Recent Conversation User: This is the achievement award it"`. An upstream auto-writer is using the user's most recent message as the concept, truncated mid-sentence. Concept embeddings on these are nearly meaningless. **`canonical` appears 681 times as a raw concept-or-tag token** — when the class is in the concept text, BM25 boosts on the query word "canonical" mean nothing.

**5. Tag-in-FTS is *less* of a problem in prod than in LoCoMo, but still real.** Production tags include `legacy_db_query` (527), `agent-output` (493), `reflection` (260), `auto-generated` (260) — these appear as raw words in FTS. They DO add discriminating signal (a query for "legacy db queries that worked" benefits from the tag). But `canonical` (681), `recall_memory` (294), and `schema` (381) are near-universal in the corpus and contribute nothing but noise floor. The LoCoMo finding generalizes weakly: *cardinality matters*. Tags that appear on >40% of memories are noise; tags that discriminate are signal.

**6. Useful content IS being captured.** Sampled high-quality engrams: working SQL with the actual queries, friction notes ("user corrected: …"), research summaries with citations, schema columns with real table data. The system has 162 `friction` engrams and 98 `correction` engrams — these are exactly the "lessons learned" the AWM design was built for. They just aren't being connected to anything.

## Phase 3 — Build (no code yet; planning)

Robert's directive: don't ignore the deferred questions, but step back. The deferred architectural questions were:

1. Tag-in-FTS: hybrid (controlled-vocab in FTS, entity tags normalized out) vs drop entirely
2. Session-ID UUIDs: enforce or advise
3. "Don't tag what's already in content"
4. Run full LoCoMo with the schema fix

This eval **reframes** those questions. In production:

- The graph is empty, so the LoCoMo tag-pollution problem (tags-bloating-FTS-with-correlated-words) is the second-order issue. The first-order issue is the agent has no graph at all.
- Session IDs are barely relevant — there's one agent, no hive contamination, no cross-session collision risk.
- "Don't tag what's already in content" is moot when `agent-output`/`recall_memory`/`canonical` appear on near-every memory as raw words — those aren't entity duplicates, they're class labels that should be in `memory_class` column, not in tags or concept text.

**The actual production-impact ranking:**

| Rank | Issue | Impact | Root Cause | Risk of fixing |
|---|---|---|---|---|
| 1 | No Hebbian edges | Memory system runs as flat retrieval; "memory" thesis unproven in prod | `recall()` doesn't call `recordCoActivation()` | Low if narrowly scoped to the recall path |
| 2 | No consolidation output | No emergent abstractions; long-tail memories accumulate without compression | Salience features hardcoded uniform + no associations to cluster | Medium — touches salience pipeline |
| 3 | Recursive self-references | Memory pollution; same fact stored 3x | No upsert; recall output ingested as new content | **Low if we just block recall-stringified content at the write boundary** |
| 4 | Garbage concepts | Concept embeddings near-useless for ~30% of corpus | Upstream auto-writer uses user msg as concept | Low — change concept extractor |
| 5 | Raw class tokens in FTS | Modest BM25 noise floor | `canonical`/`recall_memory`/`schema` raw words on >40% of corpus | Low — pure write-path filter |
| 6 | LoCoMo-style tag-in-FTS over-match | Real but second-order | Same | Low |

## Phase 4 — Verify (does the data support the diagnosis?)

**Cross-checks:**

- Hebbian: 0 / 1,506. If even one edge existed I'd suspect a different cause. Hard zero implies the path isn't wired, not "wired but threshold too high." ✓
- Episodes: 0. Confirms consolidation hasn't emitted anything. ✓
- Concept duplication: 3 INFORMATION_SCHEMA records in a random sample of 6 canonical engrams. That's a ~50% duplicate rate in the canonical class for high-frequency topics. ✓
- Concept noise: "Task: # Recent Conversation User: <truncated>" appears across multiple agent-output engrams. Confirmed regex-style template, not a one-off. ✓
- The enrichTags patch landing: 55% prefixed in 7d vs 5% before is unambiguous. ✓

## Phase 5 — Challenge (5-perspective production-failure debate)

Each perspective names a *specific* failure mode of the proposed plan.

**Requirements perspective: "What did the user actually ask for?"**
Robert asked for evaluation, not a fix. The deliverable here is a grounded picture + an explicit regression-guarded improvement plan he can approve or redirect. *Failure mode if I get this wrong:* I jump into a code change he didn't authorize, and the next session has to revert work he didn't want done. → **Mitigation: this doc ships as analysis + proposal, not as code changes.**

**Architecture perspective: "What breaks if we wire recordCoActivation()?"**
Concrete trigger: the production agent does ~50 recalls/day. Each recall returns 5 memories. If every co-activation creates an edge, that's ~50 × C(5,2) = 500 edge updates/day. Within a year, the graph has 180k edges on 50k engrams — manageable. *But* if `recordCoActivation` has a write-amplification bug (each call triggers an embedding recompute, or holds a write lock), the recall path could go from <50ms to >500ms. → **Mitigation: profile on a copy of the prod DB before deploying. Add an explicit edge-write rate cap (e.g. ≤10 edges per recall).**

**User perspective: "What happens to the agent's behavior after these fixes?"**
The agent currently uses recall results directly. If we suddenly turn on Hebbian → consolidation → episode syntheses, recall results will start including synthesized "Memory: <X> often co-occurs with <Y>" engrams that the agent has never seen before. *Failure mode:* synthesized engrams contradict canonical engrams the agent already trusts. The agent gets confused about which memory wins. → **Mitigation: episode-class engrams enter at lower salience than canonical. Verify the activation scorer respects class-bonus (we already added that). Add explicit `class=episode` tagging so the agent's prompt can distinguish "this is a derived insight, not a verified fact."**

**QA perspective: "Can we tell whether the fix worked or made it worse?"**
We have no automated A/B harness for this. Production retrievalPrecision is the only signal, and it lags by days. *Failure mode:* we ship, prod precision drops 5pp, we don't notice for a week, we've poisoned the corpus with bad consolidations. → **Mitigation: every fix lands behind a feature flag (`AWM_HEBBIAN_ENABLED`, `AWM_CONSOLIDATION_ENABLED`, `AWM_DEDUP_ON_WRITE`). Each can be reverted from env vars without redeploy. Run for 72h with flag off → 72h with flag on → compare.**

**Product perspective: "Will the article still be true after this?"**
The "storage is not memory" thesis was that AWM is built for *selective retention and connection*, not retrieve-everything. The embarrassing truth this eval surfaced: in production right now, AWM is *operating* as storage. The connection machinery exists but isn't running. *Failure mode:* if I publish the article without acknowledging this, a sophisticated reader (who reads the AWM source) will notice that `recall()` doesn't call `recordCoActivation()` and the article looks dishonest. → **Mitigation: either fix the wiring before the article ships, or amend the article with an "implementation gap" section that's specific about what's running vs designed.**

## Phase 6 — Close

**Verdict: REVISE the plan, do not yet implement.**

The original deferred questions (tag-in-FTS schema, UUID sids) were about LoCoMo-benchmark-induced symptoms. Production has a more fundamental issue: the connection machinery is dormant. Fixing the schema before fixing the dormancy would be optimizing the wrong layer.

### Proposed sequence (each step is independently shippable behind a flag)

**Step A — Stop the pollution.** Two narrow write-path filters, no schema change:
- A1. **Block recall-output ingestion.** At `write()` and `writeCanonical()`, reject content that matches `/Found \d+ matching memories|Memory \d+ \(score: [\d.]+\)/` — that's recall output. This stops the recursive self-reference bug. *Regression guard:* logs the rejection, doesn't silently drop. Flag: `AWM_BLOCK_RECALL_REINGEST`.
- A2. **Fix the garbage-concept upstream.** Find the auto-writer that uses `"Task: # Recent Conversation User: …"` as a concept. Replace with a 5-word summary extracted from the content. *Regression guard:* keep the raw text in `content`, only change `concept`.

**Step B — Wire Hebbian.** Add `recordCoActivation()` to the recall path:
- B1. After `activation.activate()` returns N results, call `connections.recordCoActivation(query, results.map(r => r.engram.id))` with a rate cap of 10 edges/recall.
- B2. Feature flag: `AWM_HEBBIAN_ON_RECALL`. Off → no behavioral change. On → edges start forming.
- *Regression guard:* benchmark a representative recall on a copy of the prod DB before/after. Acceptable: ≤20ms p95 increase.

**Step C — Differentiate salience.** Stop hardcoding `surprise: 0.3`. At least:
- C1. For `friction`/`correction` content, set `surprise: 0.7` and `eventType: 'friction'`.
- C2. For decisions (intent=decision), set `decisionMade: true` (we partially do this already).
- C3. For self-reference (caught by A1) → don't write at all.
- *Regression guard:* class-bonus reranker already exists; salience changes only affect *new* engrams, not the existing corpus.

**Step D — Re-evaluate tag-in-FTS** only after A/B/C have run for 2 weeks. With recursive duplicates gone and Hebbian edges forming, the noise picture changes. The LoCoMo result may not generalize cleanly to a cleaner corpus.

### Explicit regression guards (cross-cutting)

1. Every change behind an env-var feature flag, default OFF.
2. Each flag flips one knob — never bundle.
3. Before flipping a flag in prod, run on a `cp` of the prod DB locally and verify recall precision on a held-out set of 20 known-good queries.
4. Roll one flag at a time. 72h observation between flips.
5. **Do not yet change the FTS schema** (drop tags column, add normalized engram_tags). The benefit is unclear; the migration cost is non-trivial.
6. **Do not yet enforce UUID sids.** Single-agent prod doesn't have collision risk. Defer until hive deployment.

### What we are NOT doing now (and why)

- Not running full LoCoMo with the schema fix. Reason: LoCoMo measures retrieve-everything-then-answer, which doesn't reflect production. Production correlation is what matters, and we have that signal (75% retrievalPrecision).
- Not publishing the article yet. Reason: would need to be amended to acknowledge the Hebbian/consolidation dormancy. Either fix first, or rewrite the article to be honest about the gap.
- Not touching the existing 1,506 engrams. Reason: backfilling enrichTags on the 951 old engrams is tempting but high-risk (overwrites real tag history). Let the old corpus age out via consolidation/retraction once those work.

## What this eval gave us

- A grounded picture of the actual production memory shape, not LoCoMo extrapolation.
- A correctly-prioritized fix list, with the LoCoMo-derived schema work explicitly demoted to step D.
- Five named production failure modes for the proposed fixes, each with a concrete mitigation.
- A flag-based deploy plan that lets us reverse any step without code revert.

The deferred architectural questions (tag-in-FTS, UUID sids) are not wrong — they're just second-order until the first-order dormancy is fixed.

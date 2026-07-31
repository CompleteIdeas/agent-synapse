# Agent-Working-Hive Architecture

## Goal

Create a new product layer, `Agent-Working-Hive` (AWH), that is:

- more **AWM-centric** than `AgentSynapse`
- more **agent-runtime agnostic** than the current Claude-first wrapper
- smaller in conceptual surface area than today's mixed memory + orchestration + launcher bundle

The core principle is:

`AgentWorkingMemory` is the durable substrate.

`Agent-Working-Hive` is the orchestration runtime that uses AWM as its system of record.

## Why split from AgentSynapse

`AgentSynapse` currently bundles three distinct concerns:

1. durable memory and coordination state
2. orchestration policy and worker lifecycle
3. Claude-specific launch, plugin, channel, and hook ergonomics

That worked to prove the system, but it now creates structural drag:

- AWM evolves into the real platform, while Synapse still looks like the owner
- Claude-specific assumptions leak into generic hive logic
- legacy packages remain in the tree after AWM absorbed coordination
- the repo tells two stories at once:
  - "AWM is the substrate"
  - "Synapse is still the product"

The split should make the product line explicit:

- `agent-working-memory`
- `agent-working-hive`
- adapter packages per client/runtime

## Product boundaries

### AWM owns

AWM remains the durable system of record:

- memory write / recall / restore / checkpoint
- supersede / retract / feedback
- persistent tasks
- persistent coordination state
- workers, assignments, locks, commands, findings, decisions
- workspace memory sharing
- event trail and health metrics

AWM should be the place where long-lived facts survive restarts, client changes, and hive-runtime replacement.

### AWH owns

AWH becomes the runtime and policy layer above AWM:

- worker lifecycle orchestration
- scheduling and dispatch policy
- retry / reassign / stall handling
- wakeup strategies
- execution profiles
- long-task anti-drift discipline
- adapter selection and runtime capabilities

AWH should be disposable. If the hive runtime crashes or is replaced, the memory and coordination state remain intact in AWM.

### Adapters own

Adapters handle client-specific mechanics:

- how a worker session is launched
- how instructions are injected
- how wakeup/push works
- how hooks are installed
- how local capabilities are discovered

Examples:

- `@agent-working-hive/adapter-claude-code`
- `@agent-working-hive/adapter-codex`
- `@agent-working-hive/adapter-cursor`

## Proposed architecture

```text
                      +--------------------------------------+
                      |        AgentWorkingMemory (AWM)      |
                      |--------------------------------------|
                      | durable memory                       |
                      | durable coordination state           |
                      | MCP + HTTP APIs                      |
                      | tasks / assignments / locks / events |
                      +------------------+-------------------+
                                         ^
                                         |
                    reads/writes durable state and coordination
                                         |
                      +------------------+-------------------+
                      |       Agent-Working-Hive (AWH)       |
                      |--------------------------------------|
                      | orchestrator loop                    |
                      | dispatch and retry policy            |
                      | worker state machine                 |
                      | execution profiles                   |
                      | delivery discipline                  |
                      | transport abstraction                |
                      +----------+---------------+-----------+
                                 |               |
                                 |               |
                  +--------------+---+       +---+----------------+
                  | Adapters         |       | Profiles / Policy  |
                  |------------------|       |--------------------|
                  | Claude Code      |       | worker             |
                  | Codex            |       | coordinator        |
                  | Cursor           |       | reviewer           |
                  | HTTP/headless    |       | delivery-discipline|
                  +------------------+       +--------------------+
```

## Internal modules

The new hive should have five internal module groups.

### 1. `core`

Responsibilities:

- orchestrator event loop
- worker state machine
- assignment claim / handoff orchestration
- heartbeat interpretation
- backoff and retry primitives

This is the most runtime-agnostic part of the system.

### 2. `policies`

Responsibilities:

- assignment strategy
- prioritization
- stall detection
- reassign rules
- idle polling policy
- delivery discipline policy

Policies should be swappable and testable without changing adapters.

### 3. `transport`

Responsibilities:

- wakeup abstraction
- mailbox abstraction
- push notification abstraction
- fallback polling abstraction

This is where "Claude channels", "Codex notification path", or "HTTP wakeup endpoint" get normalized behind one interface.

### 4. `adapters`

Responsibilities:

- launch command generation
- instruction installation
- session metadata capture
- client capability detection
- adapter-specific health checks

This is where client-specific assumptions belong, not in `core`.

### 5. `profiles`

Responsibilities:

- named behavior bundles for common roles
- profile-specific prompts/instructions
- profile-specific verification requirements

Examples:

- `coordinator`
- `worker`
- `reviewer`
- `auditor`
- `first-class-delivery`

## Data model philosophy

Do not create a second durable state store in AWH unless unavoidable.

The default should be:

- AWM stores durable facts and coordination records
- AWH stores only ephemeral runtime cache or process-local state

That means:

- no second permanent assignment DB
- no second task ledger
- no second "agent memory" concept

If AWH needs local cache, it should be reconstructible from AWM.

## Execution model

### Single-agent mode

- AWH can run in a lightweight local mode
- no coordination transport required
- still uses AWM for restore, recall, tasks, and long-task discipline

### Hive mode

- workers register through an adapter
- coordinator loop reads AWM coordination state
- transport wakes idle workers
- profile rules determine how tasks are executed and verified

### Hybrid mode

- human manually launches some workers
- AWH manages policy and routing
- adapters normalize different agent clients under one hive

## Recommended AWH profiles

### `worker`

- generic execution profile
- claims or receives assignments
- acquires locks before edits
- writes findings and learned patterns into AWM

### `coordinator`

- dispatches work
- watches liveness
- reassigns stalled work
- does not become the source of truth for durable knowledge

### `reviewer`

- code-review or audit-oriented profile
- reports findings into AWM and coordination findings
- optimized for severity, proof, and verification

### `first-class-delivery`

- anti-drift execution profile
- recall first
- quote requirement
- plan touched surfaces before coding
- challenge before closeout
- explicit `PASS` / `REVISE` / `BLOCK`

This profile is the clean successor to the most valuable parts of the current `first-class-delivery` Claude skill.

## Migration principles

1. Move generic orchestration logic into AWH.
2. Leave durable memory and durable coordination in AWM.
3. Move client-specific mechanics into adapters.
4. Retire legacy packages rather than carrying dual systems.
5. Prefer profile-driven behavior over one-off launcher scripts.

## Naming

Recommended family:

- `agent-working-memory`
- `agent-working-hive`

Optional namespace packages:

- `@agent-working-hive/core`
- `@agent-working-hive/adapter-claude-code`
- `@agent-working-hive/adapter-codex`
- `@agent-working-hive/profile-first-class-delivery`

## Immediate next step

Build AWH as a thin orchestration layer first.

Do not re-implement memory, coordination persistence, or durable task storage in the new repo.

Version 1 should prove:

- adapter abstraction
- profile abstraction
- runtime-agnostic worker orchestration
- AWM-native durable state

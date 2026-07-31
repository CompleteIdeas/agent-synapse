# AgentSynapse to Agent-Working-Hive Migration Map

## Summary

`AgentSynapse` should be treated as the proving ground that now needs to split into:

- **AWM** for durable substrate
- **AWH** for runtime orchestration
- **adapter packages** for Claude/Codex/client-specific glue

This document maps current packages and surfaces into:

- **Keep in AWM**
- **Move to AWH**
- **Move to adapter**
- **Retire**

## Package map

### `packages/awm`

Current role:

- memory engine
- MCP + HTTP API
- durable coordination backend

Target:

- **Keep in AWM**

Why:

- already the durable substrate
- already owns memory and coordination state
- should remain the system of record

Notes:

- continue to harden docs/setup/adapters
- expose stable interfaces for hive runtimes

### `packages/coordinator`

Current role:

- deprecated legacy coordinator

Target:

- **Retire**

Why:

- coordination already lives in AWM
- carrying a deprecated package increases conceptual noise

Action:

- freeze for history only
- remove from active workspace and docs once migration is complete

### `packages/memory`

Current role:

- older memory package lineage

Target:

- **Retire**

Why:

- duplicates `packages/awm`
- creates ambiguity about which memory package is canonical

Action:

- archive after confirming no active dependency path remains

### `packages/memory-client`

Current role:

- thin HTTP client for AWM

Target:

- **Move to AWH shared client layer** or **promote as standalone AWM SDK**

Preferred:

- keep as an AWM SDK package if you want generic programmatic consumers

Alternative:

- rehome into AWH if it becomes orchestration-specific

Recommendation:

- rename conceptually toward `@agent-working-memory/client`

### `packages/synapse-push`

Current role:

- push-based wakeup bridge for Claude channels

Target:

- **Move to adapter layer**

Why:

- wakeup transport is runtime-specific
- should not live in the generic hive core

Recommendation:

- refactor into `@agent-working-hive/adapter-claude-code`
- split generic push abstractions from Claude-specific channel delivery

### `packages/task-manager`

Current role:

- legacy task management service

Target:

- **Retire** or **re-scope as strategic backlog tool**

Why:

- AWM already owns persistent tasks for execution state
- keeping a second task system confuses ownership

Recommendation:

- if retained, treat it as a higher-level planning/backlog system, not hive runtime state
- do not let it compete with AWM assignments/tasks

### `packages/awm-plugin`

Current role:

- plugin packaging and integration glue

Target:

- **Move to adapter layer**

Why:

- this is client-specific packaging, not hive core logic

Recommendation:

- rehome under adapter-specific packages

## Root-level surfaces

### `bin/synapse.js`

Current role:

- mixed CLI for init, ingest, service start, worker launch, workspace registration

Target:

- **Split**

Recommended split:

- AWM CLI remains with AWM
- AWH gets a new hive CLI
- adapter-specific install/setup commands belong to adapters

Suggested future commands:

- `awh init`
- `awh workspace add`
- `awh start`
- `awh worker`
- `awh coordinator`
- `awh profile install`

### `launchers/`

Current role:

- Windows/Unix launch scripts for current Claude-oriented hive

Target:

- **Move mostly to adapters**

Why:

- launchers encode client/runtime assumptions

Recommendation:

- keep only generic bootstrap helpers in AWH
- adapter packages own client launch recipes

### `.claude/agents`, `skills`, `hooks`, `commands`

Current role:

- Claude-first operating system for the hive

Target:

- **Move to adapter and profile packages**

Recommendation:

- Claude-specific agent defs and hooks -> Claude adapter
- profile-like operating rules -> AWH profiles
- high-value discipline workflows -> AWH profiles plus generated instructions

## Keep / Move / Retire table

| Current surface | Target home | Decision |
|---|---|---|
| `packages/awm` | AWM | Keep |
| `packages/coordinator` | none | Retire |
| `packages/memory` | none | Retire |
| `packages/memory-client` | AWM SDK or AWH shared client | Move / rename |
| `packages/synapse-push` | AWH adapter | Move |
| `packages/task-manager` | strategic planning tool or none | Retire / re-scope |
| `bin/synapse.js` | split across AWM / AWH / adapters | Split |
| `launchers/*` | adapters | Move |
| `.claude/*` runtime glue | adapters + profiles | Move |
| `skills/first-class-delivery` style logic | AWH profile | Move conceptually |

## Recommended migration order

### Phase 1

- declare AWM the durable substrate
- freeze deprecated packages
- write the new AWH architecture and package plan

### Phase 2

- create AWH repo/package scaffold
- extract generic orchestration loop
- define adapter contracts

### Phase 3

- move Claude-specific push/channel/launch behavior into Claude adapter
- create Codex adapter in parallel

### Phase 4

- migrate delivery-discipline into profile system
- remove dependency on legacy Synapse package layout

### Phase 5

- archive or slim AgentSynapse into historical wrapper docs

## Success criteria

The migration is successful when:

- AWM is unambiguously the system of record
- AWH can orchestrate workers without being Claude-specific
- a Codex adapter and Claude adapter can both use the same hive core
- no duplicate durable task/memory system remains
- the old Synapse repo is no longer needed to explain the architecture

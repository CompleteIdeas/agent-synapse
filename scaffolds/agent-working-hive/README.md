# Agent-Working-Hive Scaffold

This is a minimal scaffold for a new `agent-working-hive` repo.

It assumes:

- `agent-working-memory` is the durable memory + coordination substrate
- `agent-working-hive` is the orchestration runtime
- client-specific behavior lives in adapters

Suggested first milestone:

1. define adapter contracts
2. define profile contracts
3. implement a minimal coordinator loop
4. implement Claude and Codex adapters
5. keep durable state in AWM only

## Suggested packages

- `@agent-working-hive/core`
- `@agent-working-hive/transport-http`
- `@agent-working-hive/adapter-claude-code`
- `@agent-working-hive/adapter-codex`
- `@agent-working-hive/profile-first-class-delivery`

## Suggested repo commands

- `npm run build`
- `npm run typecheck`
- `npm run test`

## Suggested first implementation sequence

1. `core`: worker state machine and coordinator loop
2. `transport-http`: generic wakeup/mailbox abstraction
3. `adapter-claude-code`: current Synapse push/channel integration
4. `adapter-codex`: Codex launch/instruction integration
5. `profile-first-class-delivery`: anti-drift execution policy

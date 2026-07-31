# Launch Model

## Goal

The hive core should not know whether workers are launched by:

- `claude`
- `codex`
- `cursor-agent`
- a custom MCP-aware wrapper
- a plain headless process

Instead, the core asks an adapter for a **launch spec**.

## Core abstraction

The adapter contract returns a normalized `LaunchSpec`:

- `command`
- `args`
- `env`
- `cwd`
- `stdio`
- `interactive`
- `wakeup`

The hive runtime then decides how to execute it:

- spawn locally
- launch in terminal tabs
- hand off to another launcher
- serialize into a job queue

## Why this matters

This prevents the current Synapse problem where launchers, channels, hooks, and client assumptions are mixed into one product surface.

The core should decide:

- which worker to run
- with which profile
- with which workspace
- with which memory/coordination env

The adapter should decide:

- which executable to call
- how to inject instructions
- how to pass model/profile/session metadata
- how to wake the client up later

## Wakeup abstraction

Portable launch also requires portable wakeup.

Each adapter should declare a `wakeup.kind`:

- `push-channel`
- `http-mailbox`
- `polling`
- `none`

This lets the hive core plan behavior without hardcoding Claude channel semantics.

## Suggested runtime flow

1. Core picks worker + profile + workspace.
2. Core asks adapter for `LaunchSpec`.
3. Launcher executes the spec.
4. Worker registers with AWM coordination.
5. Runtime uses adapter-declared wakeup strategy for future assignments.

## Minimum viable launch portability

Version 1 only needs:

- portable launch spec
- portable wakeup declaration
- portable instruction target declaration

Everything else can stay adapter-specific.

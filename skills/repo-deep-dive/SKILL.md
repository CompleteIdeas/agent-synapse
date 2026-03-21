---
name: repo-deep-dive
description: Analyze any repository and produce comprehensive Markdown documentation — architecture, onboarding, modules, API, data, and contributor guides. Use when the user wants to understand or document a codebase.
---

# Repo Deep-Dive + Markdown Documentation

**Activate when:** The user asks to analyze, document, or understand a repository/codebase. Produces a complete set of Markdown docs grounded in actual code.

---

## Non-negotiables

- Do NOT guess. Every claim must be grounded in actual repository files.
- Prefer quoting file paths + symbols (functions/classes) over vague descriptions.
- If something is unclear, create a "Questions / Unknowns" section instead of inventing.
- Keep docs practical: how to run, how it's structured, how to change it safely.

---

## Workflow

### Step 0 — Quick Inventory (no docs yet)

Scan the repo and identify:
- Language(s), framework(s), package manager(s)
- Entry points (main binaries/apps), services, CLIs
- Build tooling, test tooling, lint/format tooling
- Config files and where environments are defined

Produce a short inventory summary with:
- Top-level folder map
- Key files (package.json, pyproject.toml, go.mod, pom.xml, Dockerfile, etc.)
- How the app starts in dev and prod (if present)

Present this to the user before proceeding.

### Step 1 — ARCHITECTURE.md

Create `ARCHITECTURE.md` in the repo root with:
- High-level architecture diagram (ASCII) showing major components and data flow
- Runtime model: processes/services, ports, queues, cron jobs, workers
- Key dependencies (internal modules + major external libs)
- State and data: databases, tables/migrations, file storage, caching
- AuthN/AuthZ model if present
- Observability: logging, metrics, tracing, error reporting (what's wired up)

### Step 2 — README.md

Create or update `README.md` with:
- What this repo is (one paragraph)
- Requirements (runtime versions, system deps)
- Setup steps from a clean machine
- Common commands (dev, build, test, lint, format, typecheck)
- How to run locally (including env vars)
- How to deploy (if described in repo)
- Troubleshooting section for common failure modes found in the code

### Step 3 — Module-Level Documentation

For each major top-level area (e.g., /api, /web, /services, /packages, /infra), create docs under `/docs`:

- `docs/overview.md` — one-page map of the repo
- `docs/<area>.md` — one per major area

Each area doc must include:
- Purpose
- Key folders/files
- Public interfaces (routes, exported packages, CLI commands)
- Important flows (request lifecycle, background jobs, etc.)
- Where to add new features (best extension points)
- "Foot-guns" / gotchas (things easy to break)

### Step 4 — API / Endpoints / Contracts (if applicable)

If there is an API, create `docs/api.md` with:
- Base URLs, auth method, error format
- Endpoints grouped by domain
- Request/response examples drawn from code/tests

If there are events/messages, create `docs/events.md` describing:
- Topics, payload shape, producers/consumers

### Step 5 — Data / DB Docs (if applicable)

Create `docs/data.md` with:
- DB type + connection approach
- Migration tooling and how to run migrations
- ERD-like description (tables, key relations) based on migrations/schema files
- Seed data approach

### Step 6 — Contributing Guide

Create `docs/contributing.md` with:
- Branch/PR expectations (infer from repo if present)
- Testing strategy and how to add tests
- Style/lint rules
- Release process if present
- "When you touch X, also check Y" guidance

### Step 7 — Cross-Check and Quality Pass

Before writing final docs:
- Verify every command exists in package scripts / make targets / task runners
- Verify entry points by tracing to actual main modules
- Add `docs/unknowns.md` listing anything that can't be confirmed from the repo

---

## Output Requirements

All output must be Markdown files in the repo:

| File | Required |
|------|----------|
| `README.md` | Always |
| `ARCHITECTURE.md` | Always |
| `docs/overview.md` | Always |
| `docs/<area>.md` (per major area) | Always |
| `docs/api.md` | If API exists |
| `docs/data.md` | If DB exists |
| `docs/events.md` | If events/messages exist |
| `docs/contributing.md` | Always |
| `docs/unknowns.md` | Always |

Rules:
- Use relative links between docs
- Keep each doc skimmable: headings, bullet lists, short sections
- ASCII diagrams preferred for architecture visuals

---

## How to Use

When invoked, ask the user which repo to analyze (or use the current working directory). Then proceed step-by-step:

1. Run Step 0 and present the inventory summary
2. Ask if the user wants all steps or specific ones
3. Execute each step, writing files as you go
4. Present a final summary of all docs created

If the repo is very large, offer to focus on specific areas first.

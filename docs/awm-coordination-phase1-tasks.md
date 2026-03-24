# AWM Coordination Module — Phase 1 Task Breakdown

**Plan:** `~/.claude/plans/mellow-squishing-hearth.md` Phase 1
**Repo:** `C:/Users/robert/Personal-Projects/AgentWorkingMemory/`
**Goal:** Add optional coordination module to AWM — OFF by default, ON via `AWM_COORDINATION=true`

---

## Key Decisions (before coding)

1. **Shared DB or separate DB?** The plan says "6 new tables, only created when coordination enabled." The coordinator currently uses a separate `coord.db`. AWM uses `memory.db`. Recommendation: **same DB** (`memory.db`) — this is the whole point of merging (coordination events feed the activation engine). The coordinator tables just get created conditionally alongside the engram tables.

2. **Workspace column on assignments/commands.** The existing coordinator has `workspace` on agents, assignments, and commands (added via migration). The plan's SQL schema includes `workspace` on assignments and commands but not agents. **Include workspace on all three** — it's already in the coordinator and enables multi-project hives.

3. **Agent table collision.** AWM already has an `agents` table (id, name, created_at, config) for memory agent tracking. The coordinator's `agents` table has different columns (role, status, pid, last_seen, current_task, metadata, capabilities, workspace). **Options:**
   - (a) Rename coordination agents to `coord_agents` — clean separation, but breaks backward compat with HTTP endpoints
   - (b) Migrate the existing AWM `agents` table to include coordination columns — risky, breaks existing AWM users who don't want coordination
   - (c) Add coordination columns conditionally (ALTER TABLE when coordination enabled) — **recommended**. When `AWM_COORDINATION=true`, the existing `agents` table gets extra columns. The `id`/`name` columns already exist in both schemas. Add `role`, `status`, `pid`, `last_seen`, `current_task`, `metadata`, `capabilities`, `workspace` via ALTER TABLE migrations.

4. **Zod vs inline validation.** The coordinator uses Zod schemas extensively (`packages/coordinator/src/schemas.ts`). AWM's HTTP routes don't use Zod (they validate inline). For the coordination routes, **use Zod** — it's already a dependency (used in `mcp.ts`), and the schemas are already written.

5. **Event logging.** The coordinator logs events to an `events` table. AWM has `activation_events`, `staging_events`, `retrieval_feedback` for its own audit. **Add the coordination `events` table** as-is — it's a different audit concern (agent actions vs memory operations).

---

## Tasks (ordered by dependency)

### Task 1: Create `src/coordination/schema.ts` — Table definitions
**Files:** `src/coordination/schema.ts` (NEW)
**What:**
- Export SQL strings for 5 new tables: `assignments`, `locks`, `commands`, `findings`, `coord_events` (renamed from `events` to avoid future collision with AWM's own event tables)
- Export ALTER TABLE migrations for the existing `agents` table: add `role`, `status`, `pid`, `last_seen`, `current_task`, `metadata`, `capabilities`, `workspace` columns (only when coordination is enabled)
- Export a `initCoordinationTables(db)` function that runs all CREATE/ALTER statements
- Include workspace column on assignments and commands
- Include capabilities column on agents (JSON array)

**Key details from existing coordinator:**
- `agents`: role default 'worker', status default 'idle', capabilities is JSON text
- `assignments`: status enum pending|assigned|in_progress|completed|failed, has started_at/completed_at/result
- `locks`: file_path is PK, has reason
- `commands`: autoincrement id, command is BUILD_FREEZE|PAUSE|RESUME|SHUTDOWN, has cleared_at
- `findings`: autoincrement id, has category/severity/file_path/line_number/description/suggestion/status/resolved_at
- `coord_events`: autoincrement id, agent_id/event_type/detail/created_at

**Estimated size:** ~100 lines

---

### Task 2: Create `src/coordination/index.ts` — Module entry point
**Files:** `src/coordination/index.ts` (NEW)
**What:**
- Export `initCoordination(app, store)` function
- Calls `initCoordinationTables(store.getDb())` to create/migrate tables
- Calls `registerCoordinationRoutes(app, store)` to mount HTTP endpoints
- Exports a `isCoordinationEnabled()` helper (reads `AWM_COORDINATION` env var)
- Handles clean-slate on startup: mark stale agents as dead, release orphan locks, clear active commands (ported from coordinator's `cleanSlate()`)

**Dependencies:** Task 1 (schema)

**Estimated size:** ~60 lines

---

### Task 3: Create `src/coordination/routes.ts` — HTTP endpoints
**Files:** `src/coordination/routes.ts` (NEW)
**What:** Port all 6 coordinator route files into a single file (they're small enough). Endpoints:

**Checkin (from `routes/checkin.ts`):**
- `POST /checkin` — register/heartbeat agent. Lookup by name+workspace+status!=dead. New → 201 + create. Existing → update last_seen. Record event.
- `POST /checkout` — delete locks, set status=dead, record event.

**Assignments (from `routes/assignment.ts`):**
- `POST /assign` — create assignment, optionally bind to agent. Record event.
- `GET /assignment` — get current assignment or auto-claim oldest pending (workspace-scoped). Returns retry_after_seconds.
- `POST /assignment/:id/claim` — atomic claim (UPDATE WHERE status=pending).
- `PATCH /assignment/:id` (also POST/PUT) — update status/result. On complete/fail: set agent idle, record event.

**Locks (from `routes/lock.ts`):**
- `POST /lock` — INSERT OR IGNORE for atomic acquire. 409 if held by another. Refresh if same agent.
- `DELETE /lock` — release if owned.
- `GET /locks` — list all with agent names.

**Commands (from `routes/command.ts`):**
- `POST /command` — issue command. RESUME clears active commands.
- `GET /command` — poll active commands, sorted by priority (SHUTDOWN>BUILD_FREEZE>PAUSE).
- `GET /command/wait` — check if all workers at target status.

**Findings (from `routes/findings.ts`):**
- `POST /finding` — report finding.
- `GET /findings` — filterable list + stats.
- `POST /finding/:id/resolve` — mark resolved.
- `GET /findings/summary` — open findings stats.

**Status (from `routes/status.ts`):**
- `GET /status` — full dashboard (agents, assignments, locks, stats, recent findings).
- `GET /workers` — available workers (filterable by capability/status/workspace).
- `GET /events` — recent coord events.
- `GET /stale` — detect stale agents.
- `POST /stale/cleanup` — fail orphaned assignments, release locks, mark dead.

**Key implementation notes:**
- Uses `store.getDb()` for direct SQL (coordination is pure CRUD, no engine involvement)
- Zod validation using schemas from Task 4
- All mutations record events to `coord_events`
- Workspace-aware filtering on assignment auto-claim, command RESUME, workers list
- Stale detection: `(julianday('now') - julianday(last_seen)) * 86400 > threshold`

**Dependencies:** Task 1 (schema), Task 4 (Zod schemas)

**Estimated size:** ~450-550 lines (the current coordinator is ~500 across 6 files)

---

### Task 4: Create `src/coordination/schemas.ts` — Zod validation schemas
**Files:** `src/coordination/schemas.ts` (NEW)
**What:** Port `packages/coordinator/src/schemas.ts` as-is. Contains:
- Enums: agentRole, agentStatus, assignmentStatus, command, findingSeverity, findingCategory, findingStatus
- Request schemas: checkin, checkout, assignCreate, assignmentQuery, assignmentClaim, assignmentUpdate, lockAcquire, lockRelease, commandCreate, commandWaitQuery, findingCreate, findingsQuery
- Param schemas: assignmentId, findingId, eventsQuery, staleQuery, workersQuery

**No dependencies.** Can be done first.

**Estimated size:** ~125 lines (direct port)

---

### Task 5: Create `src/coordination/stale.ts` — Stale agent detection + cleanup
**Files:** `src/coordination/stale.ts` (NEW)
**What:**
- Export `detectStale(db, thresholdSeconds)` — returns stale agent list
- Export `cleanupStale(db, thresholdSeconds)` — fails assignments, releases locks, marks dead, records events
- Used by both routes (GET /stale, POST /stale/cleanup) and by the module init (clean-slate on startup)

**Dependencies:** Task 1 (schema)

**Estimated size:** ~60 lines

---

### Task 6: Create `src/coordination/mcp-tools.ts` — 13 MCP tool definitions
**Files:** `src/coordination/mcp-tools.ts` (NEW)
**What:** Export `registerCoordinationTools(server, db)` function that registers 13 `coord_*` tools:

| Tool | Maps to HTTP | Notes |
|------|-------------|-------|
| `coord_checkin` | POST /checkin | agent_name, role, pid |
| `coord_checkout` | POST /checkout | agent_id |
| `coord_assign` | POST /assign | agent_id?, task, description? |
| `coord_assignment` | GET /assignment | agent_id |
| `coord_assignment_update` | PATCH /assignment/:id | assignment_id, status, result? |
| `coord_lock` | POST /lock | agent_id, file_path, reason? |
| `coord_unlock` | DELETE /lock | agent_id, file_path |
| `coord_locks` | GET /locks | (no params) |
| `coord_command` | POST /command | command, reason? |
| `coord_command_poll` | GET /command | workspace? |
| `coord_workers` | GET /workers | capability?, status?, workspace? |
| `coord_finding` | POST /finding | agent_id, category, severity, description, file_path? |
| `coord_status` | GET /status | (no params) |

Each tool calls the DB directly (same as routes — no HTTP round-trip since it's in-process).

**Key:** Tool descriptions should tell Claude when/how to use each one. The `coord_checkin` description should say "Call this at session start" etc.

**Dependencies:** Task 1 (schema), Task 4 (Zod schemas for validation)

**Estimated size:** ~350-400 lines

---

### Task 7: Modify `src/storage/sqlite.ts` — Expose DB handle
**Files:** `src/storage/sqlite.ts` (MODIFY)
**What:**
- Add `getDb(): Database.Database` method to `EngramStore` class (currently the `db` field is private)
- This lets the coordination module access the same SQLite connection for its tables
- Alternative: make `db` protected — but `getDb()` is cleaner for the coordination module's needs

**No functional risk** — the existing code doesn't change, we just expose a getter.

**Dependencies:** None

**Estimated size:** ~5 lines added

---

### Task 8: Modify `src/index.ts` — Conditionally load coordination module
**Files:** `src/index.ts` (MODIFY)
**What:**
- After `registerRoutes(app, {...})`, check `AWM_COORDINATION` env var
- If enabled: `import('./coordination/index.js').then(m => m.initCoordination(app, store))`
- Log: `"Coordination module enabled"` or `"Coordination module disabled (set AWM_COORDINATION=true to enable)"`
- Pass through any coordination-specific config (stale threshold from env)

**Dependencies:** Task 2 (coordination/index.ts)

**Estimated size:** ~15 lines added

---

### Task 9: Modify `src/mcp.ts` — Conditionally register coord_* tools
**Files:** `src/mcp.ts` (MODIFY)
**What:**
- After existing tool registrations, check `AWM_COORDINATION` env var
- If enabled: call `registerCoordinationTools(server, store.getDb())`
- Import is dynamic: `const { registerCoordinationTools } = await import('./coordination/mcp-tools.js')`
- This keeps MCP tool list clean for single-agent users (no coord_* tools cluttering the list)

**Dependencies:** Task 6 (mcp-tools.ts), Task 7 (getDb exposure)

**Estimated size:** ~10 lines added

---

### Task 10: Add `GET /health` coordination fields
**Files:** `src/coordination/routes.ts` (part of Task 3) or `src/api/routes.ts` (MODIFY)
**What:**
- Extend existing `/health` response to include `coordination: true|false`
- When enabled, add `agents_alive`, `pending_tasks`, `active_locks` counts

**Dependencies:** Task 3

**Estimated size:** ~10 lines

---

### Task 11: Write tests
**Files:** `tests/coordination.test.ts` (NEW)
**What:**
- Test coordination tables are created only when `AWM_COORDINATION=true`
- Test each endpoint: checkin, checkout, assign, assignment, claim, lock, unlock, command, finding, stale cleanup
- Test workspace-scoped operations (multi-workspace isolation)
- Test backward compat: AWM without coordination works exactly as before (no coord tables, no coord routes, 404 on /checkin)
- Test MCP tools are only registered when coordination is enabled

**Dependencies:** All above tasks

**Estimated size:** ~300-400 lines

---

## Execution Order (dependency graph)

```
Task 4 (Zod schemas)     Task 7 (expose getDb)
     │                        │
     ├──────┬─────────────────┤
     │      │                 │
Task 1 (SQL schema)           │
     │                        │
     ├──────┬─────────────────┤
     │      │                 │
Task 5   Task 2            Task 6
(stale)  (module init)     (MCP tools)
     │      │                 │
     └──────┼─────────────────┘
            │
         Task 3 (HTTP routes)
            │
         Task 8 (index.ts integration)
            │
         Task 9 (mcp.ts integration)
            │
         Task 10 (health endpoint)
            │
         Task 11 (tests)
```

**Parallelizable:** Tasks 4 + 7 can run in parallel. Tasks 1, 5, 6 can start once their deps are done. Task 3 is the big one.

## Estimated Total

- **New files:** 6 (`coordination/index.ts`, `schema.ts`, `schemas.ts`, `routes.ts`, `stale.ts`, `mcp-tools.ts`)
- **Modified files:** 3 (`storage/sqlite.ts`, `index.ts`, `mcp.ts`)
- **New test file:** 1 (`tests/coordination.test.ts`)
- **Total new code:** ~1,200-1,400 lines (production) + ~300-400 lines (tests)
- **Risk level:** Low — all additive, behind feature flag, no existing behavior changes

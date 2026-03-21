# Task: Add Task Manager Service to AgentSynapse

## Goal

Extract a generic, portable task manager from the EquiHub implementation and add it as `packages/task-manager/` in AgentSynapse. This completes the 3-service stack: Memory (AWM) + Coordinator + Task Manager.

The task manager is the "brain" — it holds what should be built, who's responsible, what's blocked, and what decisions have been made. The coordinator handles real-time dispatch. Memory handles cross-session knowledge.

## Reference Implementation

The EquiHub task manager lives in:
- **API routes:** `C:\Users\robert\project\EquiHub\apps\api\src\routes\dev-task.routes.ts`
- **Service layer:** `C:\Users\robert\project\EquiHub\apps\api\src\services\dev-task.service.ts`
- **DB schema:** `C:\Users\robert\project\EquiHub\database\schema\065-dev-task-manager.sql`
- **Types:** `C:\Users\robert\project\EquiHub\packages\shared\src\types\dev-task.types.ts`
- **Validation:** `C:\Users\robert\project\EquiHub\packages\shared\src\validation\dev-task.validation.ts`

Read these files thoroughly before starting. The domain model is solid — the work is porting it to Fastify + SQLite and generalizing away EquiHub-specific concepts.

---

## Architecture

### Target Structure

```
packages/task-manager/
├── src/
│   ├── index.ts              Fastify server (port 8420)
│   ├── db.ts                 SQLite schema + migrations + helpers
│   ├── routes/
│   │   ├── tasks.ts          CRUD, status transitions, search, assign, subtasks
│   │   ├── criteria.ts       Acceptance criteria per task
│   │   ├── questions.ts      Blocking questions (human↔agent decision queue)
│   │   ├── sessions.ts       Work session logging (git commits, summaries)
│   │   ├── knowledge.ts      Decisions, patterns, lessons, assumptions
│   │   ├── components.ts     Architecture component registry
│   │   ├── sprints.ts        Sprint/milestone planning
│   │   └── dashboard.ts      Stats, progress by phase, team workload
│   └── types.ts              TypeScript interfaces + Zod schemas
├── Dockerfile
├── package.json
└── tsconfig.json
```

### Tech Stack (must match existing AgentSynapse conventions)

| Component | Technology | Reason |
|-----------|-----------|--------|
| Framework | Fastify 5 | Matches coordinator + memory |
| Database | better-sqlite3 + WAL mode | Portable, matches coordinator |
| Validation | Zod 4 | Already in the EquiHub version, AWM uses it |
| Auth | Bearer token (`TM_API_KEY` env var) | Same pattern as AWM |
| Language | TypeScript (ES2022, strict) | Matches all packages |
| Port | 8420 | Following 8400 (memory), 8410 (coordinator) |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TM_PORT` | `8420` | HTTP server port |
| `TM_DB_PATH` | `data/task.db` | SQLite database path |
| `TM_API_KEY` | *(none)* | Optional bearer token auth |

---

## Database Schema

Port from PostgreSQL (`065-dev-task-manager.sql`) to SQLite. Key changes:
- `SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `JSONB` → `TEXT` (JSON stored as string, parsed in app layer)
- `NOW()` → `datetime('now')`
- No `GIN` indexes (SQLite doesn't support them — use JSON functions for queries)
- Keep `CHECK` constraints for status enums

### Tables

**tasks** (primary key: `id VARCHAR(20)`)
- id, parent_id (self-ref), title, description
- status: backlog | requirements_review | ready | in_progress | review | done | blocked
- phase (integer, configurable — not EquiHub-specific P1-P5)
- owner, priority (1-5), estimated_effort (S/M/L/XL)
- doc_ref (generic, replaces build_doc), doc_section (replaces build_section)
- sprint_id (FK), branch, blocked_reason
- created_at, updated_at

**acceptance_criteria** (integer PK, FK task_id CASCADE)
- description, status (0=failing, 1=passing), verified_by, verified_at, sort_order

**questions** (integer PK, FK task_id CASCADE)
- question, context, asked_by, asked_at
- status: pending | answered | resolved
- answer, answered_by, answered_at, resolved_by, resolved_at

**sessions** (integer PK, FK task_id)
- started_at, ended_at, summary
- git_commits (JSON array), criteria_before, criteria_after
- session_owner (agent name or human)

**knowledge** (integer PK, self-ref superseded_by)
- category: decision | dependency | assumption | contract | concern | pattern | lesson
- title, content
- components (JSON array), task_ids (JSON array), doc_refs (JSON array), tags (JSON array)
- deposited_by, session_id, created_at, updated_at

**components** (primary key: `id VARCHAR(100)`)
- name, description, depends_on (JSON array)
- doc_ref, phase, owner
- status: planned | in_progress | implemented | stable

**sprints** (integer PK, unique sprint_number)
- name, goal, status: planned | active | completed
- start_date, end_date, sessions_planned, sessions_actual, notes

**activity_log** (integer PK)
- task_id (FK), action, actor, details (JSON), created_at

---

## API Endpoints

Port all endpoints from the EquiHub implementation. Change mount prefix from `/api/v1/dev` to root `/`.

### Tasks (10 endpoints)
- `GET /tasks` — List (filters: status, owner, phase, sprint_id, limit)
- `GET /tasks/next` — Next ready task for owner
- `GET /tasks/progress` — Stats by phase
- `GET /tasks/search?q=` — Full-text search
- `POST /tasks` — Create task
- `GET /tasks/:id` — Detail (includes criteria, questions, sessions, subtasks)
- `PUT /tasks/:id` — Update task fields
- `DELETE /tasks/:id` — Delete (only if no subtasks)
- `PUT /tasks/:id/status` — Status transition (with blocked_reason)
- `PUT /tasks/:id/assign` — Assign owner
- `POST /tasks/:id/subtasks` — Batch create subtasks
- `POST /tasks/:id/criteria` — Add acceptance criteria

### Criteria (2 endpoints)
- `PUT /criteria/:id` — Update (status 0/1, verified_by)
- `DELETE /criteria/:id` — Delete

### Questions (4 endpoints)
- `GET /questions` — List (filters: status, task_id, limit)
- `POST /questions` — Ask question
- `PUT /questions/:id/answer` — Answer
- `PUT /questions/:id/resolve` — Mark resolved

### Sessions (1 endpoint)
- `POST /sessions` — Log work session

### Knowledge (4 endpoints)
- `POST /knowledge` — Deposit
- `GET /knowledge` — Query (filters: category, component, task_id, doc_ref, tag, text search)
- `GET /knowledge/:id` — Get entry
- `PUT /knowledge/:id` — Update

### Components (4 endpoints)
- `POST /components` — Register
- `GET /components` — List (filters: phase, status, owner)
- `GET /components/:id` — Get
- `PUT /components/:id` — Update

### Sprints (4 endpoints)
- `GET /sprints` — List all
- `POST /sprints` — Create
- `GET /sprints/:number` — Detail (includes assigned tasks)
- `PUT /sprints/:number` — Update

### Dashboard (3 endpoints)
- `GET /dashboard/progress` — Progress by phase (counts per status)
- `GET /dashboard/team` — Workload per owner (total, in_progress, ready, blocked, done)
- `GET /activity` — Activity log (filters: task_id, limit)

### System (2 endpoints)
- `GET /health` — Health check
- `GET /architecture` — Component dependency map + knowledge counts

---

## Generalization Rules

When porting from EquiHub, apply these changes:

| EquiHub-Specific | Generic Replacement |
|-----------------|-------------------|
| `dev_tasks` table name | `tasks` |
| `dev_` prefix on all tables | Drop prefix |
| `build_doc` field | `doc_ref` (any external doc URL or path) |
| `build_section` field | `doc_section` |
| Phases P1-P5 hardcoded | Phase is just an integer (meaning defined by the project) |
| USEA JWT auth | Bearer token via `TM_API_KEY` env var |
| Express 5 `req/res` | Fastify `request/reply` |
| `pg` pool queries | `better-sqlite3` prepared statements |
| `JSONB` columns | `TEXT` with `JSON.parse()`/`JSON.stringify()` |
| `$1, $2` parameterized | `?, ?` parameterized |
| `COALESCE(x, '[]')::jsonb` | `JSON.parse(row.x \|\| '[]')` in app layer |
| `COUNT(*) FILTER (WHERE ...)` | Separate queries or `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` |
| Rate limiting middleware | Optional (keep for deployed, skip for local) |

---

## Docker

### Dockerfile (packages/task-manager/Dockerfile)

Multi-stage Alpine build matching the memory package pattern:
- Stage 1: Install deps + build TypeScript
- Stage 2: Minimal runner with only dist/ + node_modules
- Expose 8420
- Volume: `/data` (task.db)
- Health check: `GET /health`

### docker-compose.yml (root level, NEW)

```yaml
services:
  memory:
    build: packages/memory
    ports: ["8400:8400"]
    volumes: ["./data:/data"]

  coordinator:
    build: packages/coordinator
    ports: ["8410:8410"]
    volumes: ["./data:/data"]

  task-manager:
    build: packages/task-manager
    ports: ["8420:8420"]
    volumes: ["./data:/data"]
    environment:
      TM_DB_PATH: /data/task.db
```

### Coordinator Dockerfile (NEW — doesn't have one yet)

Same multi-stage Alpine pattern. Expose 8410, volume `/data`.

---

## Integration Points

### Orchestrator Agent Update

Update `agents/orchestrator.md` to poll the task manager instead of an external API:

```
# Old (EquiHub-specific)
curl -s "https://equihub-task-manager-production.up.railway.app/api/v1/dev/tasks?status=ready"

# New (local task manager)
curl -s "http://127.0.0.1:8420/tasks?status=ready&limit=20"
```

The orchestrator's main loop becomes:
1. Poll `GET /tasks?status=ready` from task manager (port 8420)
2. Check `GET /workers?status=idle` from coordinator (port 8410)
3. Assign via `POST /assign` on coordinator (port 8410)
4. On completion, update task status via `PUT /tasks/:id/status` on task manager

### Launcher Update

Update `launchers/start-all.bat` to start 4 services:
1. Task Manager (port 8420)
2. Coordinator (port 8410)
3. Orchestrator (Claude session)
4. Workers (Claude sessions)

Memory (AWM) runs as MCP inside each Claude session — no separate launcher needed.

### Root package.json Update

Add workspace scripts:
```json
"dev:task-manager": "npm -w @agent-synapse/task-manager run dev",
"dev": "npm run dev:task-manager & npm run dev:coordinator & npm run dev:memory"
```

---

## Acceptance Criteria

- [ ] `packages/task-manager/` exists with Fastify server on port 8420
- [ ] SQLite schema creates all 8 tables on startup
- [ ] All 34+ API endpoints implemented and return correct responses
- [ ] `GET /health` returns 200
- [ ] Task status transitions enforced (can't skip steps)
- [ ] Questions flow: pending → answered → resolved
- [ ] Knowledge supports supersession (new entry replaces old)
- [ ] Full-text search works on tasks (`/tasks/search?q=`)
- [ ] Dashboard endpoints return aggregated stats
- [ ] Bearer token auth works when `TM_API_KEY` is set, open when unset
- [ ] Dockerfile builds and runs standalone
- [ ] docker-compose.yml at root launches all 3 services
- [ ] Coordinator gets a Dockerfile too
- [ ] `launchers/start-all.bat` updated to include task manager
- [ ] Root `package.json` updated with task-manager workspace scripts
- [ ] `agents/orchestrator.md` updated to poll local task manager
- [ ] Types and Zod schemas exported for potential shared use
- [ ] Activity log records all mutations

## Not In Scope (future)

- Web dashboard / frontend (API-only for now)
- PostgreSQL adapter (SQLite only for v1)
- Migration tooling between SQLite and PostgreSQL
- Import/export between task manager instances
- Webhook notifications on status changes

---

## Estimated Effort

This is primarily a port + adaptation, not greenfield:
- Schema + db.ts: ~200 lines (port from PostgreSQL)
- Routes: ~800-1000 lines across 8 files (port from Express to Fastify)
- Types + validation: ~300 lines (port Zod schemas)
- Server + auth: ~80 lines (copy pattern from coordinator)
- Dockerfile + docker-compose: ~60 lines
- Launcher + integration updates: ~50 lines

**Total: ~1500-1700 lines of TypeScript + config**

The reference implementation exists and works. This is a translation job, not a design job.

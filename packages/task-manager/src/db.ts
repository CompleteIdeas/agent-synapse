import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

let db: Database.Database;

const SCHEMA = `
-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_number   INTEGER NOT NULL UNIQUE,
  name            VARCHAR(200) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'active', 'completed')),
  goal            TEXT,
  start_date      DATE,
  end_date        DATE,
  sessions_planned INTEGER DEFAULT 0,
  sessions_actual  INTEGER DEFAULT 0,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id               VARCHAR(20) PRIMARY KEY,
  parent_id        VARCHAR(20) REFERENCES tasks(id),
  sprint_id        INTEGER REFERENCES sprints(id),
  phase            INTEGER NOT NULL,
  title            VARCHAR(500) NOT NULL,
  description      TEXT,
  doc_ref          VARCHAR(200),
  doc_section      VARCHAR(200),
  owner            VARCHAR(50) NOT NULL DEFAULT 'unassigned',
  status           VARCHAR(30) NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog', 'requirements_review', 'ready',
                                     'in_progress', 'review', 'done', 'blocked')),
  priority         INTEGER NOT NULL DEFAULT 0,
  blocked_reason   TEXT,
  branch           VARCHAR(200),
  estimated_effort VARCHAR(5)
                   CHECK (estimated_effort IS NULL OR estimated_effort IN ('S', 'M', 'L', 'XL')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_owner    ON tasks(owner);
CREATE INDEX IF NOT EXISTS idx_tasks_phase    ON tasks(phase);
CREATE INDEX IF NOT EXISTS idx_tasks_parent   ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint   ON tasks(sprint_id);

-- Acceptance Criteria
CREATE TABLE IF NOT EXISTS acceptance_criteria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     VARCHAR(20) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status      INTEGER NOT NULL DEFAULT 0,
  verified_by VARCHAR(50),
  verified_at TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_criteria_task ON acceptance_criteria(task_id);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     VARCHAR(20) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  context     TEXT,
  asked_by    VARCHAR(50) NOT NULL,
  asked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  answered_by VARCHAR(50),
  answer      TEXT,
  answered_at TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'answered', 'resolved')),
  resolved_by VARCHAR(50),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_questions_task   ON questions(task_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         VARCHAR(20) REFERENCES tasks(id) ON DELETE SET NULL,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  summary         TEXT,
  git_commits     TEXT,
  criteria_before INTEGER NOT NULL DEFAULT 0,
  criteria_after  INTEGER NOT NULL DEFAULT 0,
  session_owner   VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    VARCHAR(20) REFERENCES tasks(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,
  actor      VARCHAR(50) NOT NULL,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_task    ON activity_log(task_id);

-- Knowledge
CREATE TABLE IF NOT EXISTS knowledge (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      VARCHAR(30) NOT NULL
                CHECK (category IN ('decision', 'dependency', 'assumption',
                                    'contract', 'concern', 'pattern', 'lesson')),
  title         VARCHAR(500) NOT NULL,
  content       TEXT NOT NULL,
  components    TEXT,
  task_ids      TEXT,
  doc_refs      TEXT,
  tags          TEXT,
  deposited_by  VARCHAR(50) NOT NULL,
  session_id    INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  superseded_by INTEGER REFERENCES knowledge(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category   ON knowledge(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_superseded ON knowledge(superseded_by);

-- Components
CREATE TABLE IF NOT EXISTS components (
  id          VARCHAR(100) PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  depends_on  TEXT,
  doc_ref     VARCHAR(200),
  phase       INTEGER,
  owner       VARCHAR(50),
  status      VARCHAR(20) NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'in_progress', 'implemented', 'stable')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_components_phase  ON components(phase);
CREATE INDEX IF NOT EXISTS idx_components_status ON components(status);
`;

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDb() first');
  return db;
}

export function closeDb(): void {
  if (db) db.close();
}

// ─── Helpers ────────────────────────────────────────────────────

export function parseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); }
  catch { return fallback; }
}

export function logActivity(
  taskId: string | null,
  action: string,
  actor: string,
  details?: Record<string, unknown>,
): void {
  getDb().prepare(
    `INSERT INTO activity_log (task_id, action, actor, details) VALUES (?, ?, ?, ?)`
  ).run(taskId, action, actor, details ? JSON.stringify(details) : null);
}

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

let db: Database.Database;

const SCHEMA = `
-- Agents: who's in the hive
CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'worker',
  status       TEXT NOT NULL DEFAULT 'idle',
  pid          INTEGER,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen    TEXT NOT NULL DEFAULT (datetime('now')),
  current_task TEXT,
  metadata     TEXT,
  capabilities TEXT  -- JSON array: ["code","review","build","test","docs"]
);

-- Assignments: what's been handed out
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT,
  task        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  started_at  TEXT,
  completed_at TEXT,
  result      TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- File locks: who owns what files
CREATE TABLE IF NOT EXISTS locks (
  file_path   TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  locked_at   TEXT NOT NULL DEFAULT (datetime('now')),
  reason      TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Commands: orchestrator broadcasts to all agents
CREATE TABLE IF NOT EXISTS commands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  command     TEXT NOT NULL,
  reason      TEXT,
  issued_by   TEXT,
  issued_at   TEXT NOT NULL DEFAULT (datetime('now')),
  cleared_at  TEXT,
  FOREIGN KEY (issued_by) REFERENCES agents(id)
);

-- Findings: things agents discover during idle work or assigned tasks
CREATE TABLE IF NOT EXISTS findings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT NOT NULL,
  category    TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  file_path   TEXT,
  line_number INTEGER,
  description TEXT NOT NULL,
  suggestion  TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Event log: audit trail for everything
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT,
  event_type  TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);

  // Migrations: add columns that may be missing from older DBs
  const cols = db.prepare(`PRAGMA table_info(agents)`).all() as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('capabilities')) {
    db.exec(`ALTER TABLE agents ADD COLUMN capabilities TEXT`);
  }
  if (!colNames.includes('workspace')) {
    db.exec(`ALTER TABLE agents ADD COLUMN workspace TEXT`);
  }

  const assignCols = (db.prepare(`PRAGMA table_info(assignments)`).all() as { name: string }[]).map(c => c.name);
  if (!assignCols.includes('workspace')) {
    db.exec(`ALTER TABLE assignments ADD COLUMN workspace TEXT`);
  }

  const cmdCols = (db.prepare(`PRAGMA table_info(commands)`).all() as { name: string }[]).map(c => c.name);
  if (!cmdCols.includes('workspace')) {
    db.exec(`ALTER TABLE commands ADD COLUMN workspace TEXT`);
  }

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDb() first');
  return db;
}

export function closeDb(): void {
  if (db) db.close();
}

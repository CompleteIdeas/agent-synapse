import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { eventsQuerySchema, staleQuerySchema, workersQuerySchema } from '../schemas.js';
import { SESSION_START } from '../index.js';

export function registerStatusRoutes(app: FastifyInstance): void {

  // Full dashboard view — agents, assignments, locks
  app.get('/status', async (_req, reply) => {
    const db = getDb();

    const agents = db.prepare(
      `SELECT id, name, role, status, current_task, last_seen,
              ROUND((julianday('now') - julianday(last_seen)) * 86400) AS seconds_since_seen
       FROM agents WHERE status != 'dead'
       ORDER BY role, name`
    ).all();

    const assignments = db.prepare(
      `SELECT a.id, a.task, a.description, a.status, a.agent_id, ag.name AS agent_name,
              a.created_at, a.started_at, a.completed_at
       FROM assignments a LEFT JOIN agents ag ON a.agent_id = ag.id
       WHERE a.status NOT IN ('completed', 'failed')
       ORDER BY a.created_at`
    ).all();

    const locks = db.prepare(
      `SELECT l.file_path, l.agent_id, a.name AS agent_name, l.locked_at, l.reason
       FROM locks l JOIN agents a ON l.agent_id = a.id`
    ).all();

    const stats = db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM agents WHERE status != 'dead') AS alive_agents,
         (SELECT COUNT(*) FROM agents WHERE status = 'working') AS busy_agents,
         (SELECT COUNT(*) FROM assignments WHERE status = 'pending') AS pending_tasks,
         (SELECT COUNT(*) FROM assignments WHERE status IN ('assigned', 'in_progress')) AS active_tasks,
         (SELECT COUNT(*) FROM locks) AS active_locks,
         (SELECT COUNT(*) FROM findings WHERE status = 'open') AS open_findings,
         (SELECT COUNT(*) FROM findings WHERE status = 'open' AND severity IN ('critical', 'error')) AS urgent_findings`
    ).get();

    const recentFindings = db.prepare(
      `SELECT f.id, f.category, f.severity, f.file_path, f.description, a.name AS agent_name, f.created_at
       FROM findings f JOIN agents a ON f.agent_id = a.id
       WHERE f.status = 'open'
       ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END,
                f.created_at DESC
       LIMIT 10`
    ).all();

    return reply.send({ agents, assignments, locks, stats, recentFindings });
  });

  // Available workers — who's checked in and ready for assignments
  app.get('/workers', async (req, reply) => {
    const q = workersQuerySchema.safeParse(req.query);
    const { capability, status: filterStatus, workspace } = q.success ? q.data : { capability: undefined, status: undefined, workspace: undefined };
    const db = getDb();

    // Get all non-dead, non-orchestrator agents (optionally filtered by workspace)
    let workers = workspace
      ? db.prepare(
          `SELECT id, name, role, status, current_task, capabilities, workspace, last_seen,
                  ROUND((julianday('now') - julianday(last_seen)) * 86400) AS seconds_since_seen
           FROM agents
           WHERE status != 'dead' AND role != 'orchestrator' AND workspace = ?
           ORDER BY name`
        ).all(workspace) as Array<{
          id: string; name: string; role: string; status: string;
          current_task: string | null; capabilities: string | null;
          workspace: string | null; last_seen: string; seconds_since_seen: number;
        }>
      : db.prepare(
          `SELECT id, name, role, status, current_task, capabilities, workspace, last_seen,
                  ROUND((julianday('now') - julianday(last_seen)) * 86400) AS seconds_since_seen
           FROM agents
           WHERE status != 'dead' AND role != 'orchestrator'
           ORDER BY name`
        ).all() as Array<{
          id: string; name: string; role: string; status: string;
          current_task: string | null; capabilities: string | null;
          workspace: string | null; last_seen: string; seconds_since_seen: number;
        }>;

    // Filter by capability if requested
    if (capability) {
      workers = workers.filter(w => {
        if (!w.capabilities) return false;
        try {
          const caps = JSON.parse(w.capabilities) as string[];
          return caps.includes(capability);
        } catch {
          return false;
        }
      });
    }

    // Filter by status if requested
    if (filterStatus) {
      workers = workers.filter(w => w.status === filterStatus);
    }

    // Parse capabilities for cleaner output
    const result = workers.map(w => ({
      id: w.id,
      name: w.name,
      role: w.role,
      status: w.status,
      currentTask: w.current_task,
      capabilities: w.capabilities ? JSON.parse(w.capabilities) : [],
      workspace: w.workspace,
      lastSeen: w.last_seen,
      secondsSinceSeen: w.seconds_since_seen,
      alive: w.seconds_since_seen < 120,
    }));

    return reply.send({
      count: result.length,
      idle: result.filter(w => w.status === 'idle').length,
      working: result.filter(w => w.status === 'working').length,
      workers: result,
    });
  });

  // Health check
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'coordinator', port: parseInt(process.env.COORD_PORT ?? '8410', 10), session_start: SESSION_START });
  });

  // Recent events (audit log)
  app.get('/events', async (req, reply) => {
    const q = eventsQuerySchema.safeParse(req.query);
    const limit = q.success ? q.data.limit : 50;
    const db = getDb();

    const events = db.prepare(
      `SELECT e.id, e.agent_id, a.name AS agent_name, e.event_type, e.detail, e.created_at
       FROM events e LEFT JOIN agents a ON e.agent_id = a.id
       ORDER BY e.created_at DESC LIMIT ?`
    ).all(limit);

    return reply.send({ events });
  });

  // Stale agent detection — read-only query
  app.get('/stale', async (req, reply) => {
    const q = staleQuerySchema.safeParse(req.query);
    const threshold = q.success ? q.data.seconds : 120;
    const cleanup = q.success ? q.data.cleanup : undefined;

    const db = getDb();
    const stale = db.prepare(
      `SELECT id, name, role, status, last_seen,
              ROUND((julianday('now') - julianday(last_seen)) * 86400) AS seconds_since_seen
       FROM agents
       WHERE status NOT IN ('dead')
         AND (julianday('now') - julianday(last_seen)) * 86400 > ?`
    ).all(threshold) as Array<{ id: string; name: string; status: string }>;

    // Legacy support: redirect cleanup=1 to POST endpoint behavior
    if (cleanup === '1' || cleanup === 'true') {
      const cleaned = cleanupStaleAgents(stale);
      return reply.send({ stale, threshold_seconds: threshold, cleaned });
    }

    return reply.send({ stale, threshold_seconds: threshold });
  });

  // Stale agent cleanup — mutating operation
  app.post('/stale/cleanup', async (req, reply) => {
    const q = staleQuerySchema.safeParse(req.query);
    const threshold = q.success ? q.data.seconds : 120;

    const db = getDb();
    const stale = db.prepare(
      `SELECT id, name, role, status, last_seen,
              ROUND((julianday('now') - julianday(last_seen)) * 86400) AS seconds_since_seen
       FROM agents
       WHERE status NOT IN ('dead')
         AND (julianday('now') - julianday(last_seen)) * 86400 > ?`
    ).all(threshold) as Array<{ id: string; name: string; status: string }>;

    const cleaned = cleanupStaleAgents(stale);
    return reply.send({ stale, threshold_seconds: threshold, cleaned });
  });
}

function cleanupStaleAgents(stale: Array<{ id: string; name: string; status: string }>): number {
  const db = getDb();
  let cleaned = 0;

  for (const agent of stale) {
    // Fail any active assignments
    const orphaned = db.prepare(
      `UPDATE assignments SET status = 'failed', result = 'agent disconnected (stale)', completed_at = datetime('now')
       WHERE agent_id = ? AND status IN ('assigned', 'in_progress')`
    ).run(agent.id);

    if (orphaned.changes > 0) {
      db.prepare(
        `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'assignment_failed', ?)`
      ).run(agent.id, `auto-failed ${orphaned.changes} orphaned assignment(s) — agent stale`);
    }

    // Release locks
    const locks = db.prepare(`DELETE FROM locks WHERE agent_id = ?`).run(agent.id);

    // Mark agent dead
    db.prepare(`UPDATE agents SET status = 'dead', current_task = NULL WHERE id = ?`).run(agent.id);

    cleaned += orphaned.changes + locks.changes;

    if (orphaned.changes > 0 || locks.changes > 0) {
      db.prepare(
        `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'stale_cleanup', ?)`
      ).run(agent.id, `failed ${orphaned.changes} assignment(s), released ${locks.changes} lock(s)`);
    }
  }

  return cleaned;
}

import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { lockAcquireSchema, lockReleaseSchema } from '../schemas.js';

export function registerLockRoutes(app: FastifyInstance): void {

  // Acquire a file lock
  app.post('/lock', async (req, reply) => {
    const parsed = lockAcquireSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { agentId, filePath, reason } = parsed.data;

    const db = getDb();

    // Atomic lock acquisition — INSERT OR IGNORE avoids TOCTOU race
    const inserted = db.prepare(
      `INSERT OR IGNORE INTO locks (file_path, agent_id, reason) VALUES (?, ?, ?)`
    ).run(filePath, agentId, reason ?? null);

    if (inserted.changes > 0) {
      // We acquired the lock
      db.prepare(
        `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'lock_acquired', ?)`
      ).run(agentId, filePath);
      return reply.send({ ok: true, action: 'acquired' });
    }

    // Row already exists — check who owns it
    const existing = db.prepare(
      `SELECT agent_id FROM locks WHERE file_path = ?`
    ).get(filePath) as { agent_id: string } | undefined;

    if (existing?.agent_id === agentId) {
      // Already own it — refresh
      db.prepare(`UPDATE locks SET locked_at = datetime('now') WHERE file_path = ?`).run(filePath);
      return reply.send({ ok: true, action: 'refreshed' });
    }

    return reply.code(409).send({
      error: 'file locked by another agent',
      lockedBy: existing?.agent_id,
    });
  });

  // Release a file lock
  app.delete('/lock', async (req, reply) => {
    const parsed = lockReleaseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { agentId, filePath } = parsed.data;

    const db = getDb();

    const result = db.prepare(
      `DELETE FROM locks WHERE file_path = ? AND agent_id = ?`
    ).run(filePath, agentId);

    if (result.changes === 0) {
      return reply.code(404).send({ error: 'lock not found or not owned by this agent' });
    }

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'lock_released', ?)`
    ).run(agentId, filePath);

    return reply.send({ ok: true });
  });

  // List all current locks
  app.get('/locks', async (_req, reply) => {
    const db = getDb();
    const locks = db.prepare(
      `SELECT l.file_path, l.agent_id, a.name AS agent_name, l.locked_at, l.reason
       FROM locks l JOIN agents a ON l.agent_id = a.id
       ORDER BY l.locked_at DESC`
    ).all();

    return reply.send({ locks });
  });
}

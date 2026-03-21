import type { FastifyInstance } from 'fastify';
import { getDb, logActivity } from '../db.js';
import { sessionCreateSchema } from '../types.js';

export function registerSessionRoutes(app: FastifyInstance): void {
  // POST /sessions
  app.post('/sessions', async (request, reply) => {
    const p = sessionCreateSchema.parse(request.body);
    const db = getDb();

    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(p.task_id);
    if (!task) {
      reply.status(404);
      return { data: { success: false, session_id: 0, message: `Task ${p.task_id} not found` }, error: { code: 'NOT_FOUND', message: `Task ${p.task_id} not found` } };
    }

    // Count criteria passing before
    const criteriaBefore = (db.prepare('SELECT COUNT(*) as count FROM acceptance_criteria WHERE task_id = ? AND status = 1').get(p.task_id) as { count: number }).count;

    // Mark criteria if provided
    if (p.criteria_completed && p.criteria_completed.length > 0) {
      const stmt = db.prepare('UPDATE acceptance_criteria SET status = 1, verified_by = ?, verified_at = datetime(\'now\') WHERE id = ?');
      for (const cid of p.criteria_completed) {
        stmt.run(p.session_owner, cid);
      }
    }

    // Count criteria after
    const criteriaAfter = (db.prepare('SELECT COUNT(*) as count FROM acceptance_criteria WHERE task_id = ? AND status = 1').get(p.task_id) as { count: number }).count;

    const result = db.prepare(
      `INSERT INTO sessions (task_id, ended_at, summary, git_commits, criteria_before, criteria_after, session_owner)
       VALUES (?, datetime('now'), ?, ?, ?, ?, ?)`
    ).run(
      p.task_id,
      p.summary,
      p.git_commits ? JSON.stringify(p.git_commits) : null,
      criteriaBefore,
      criteriaAfter,
      p.session_owner,
    );
    const sessionId = Number(result.lastInsertRowid);

    logActivity(p.task_id, 'session_logged', p.session_owner, {
      session_id: sessionId,
      summary: p.summary,
      criteria_before: criteriaBefore,
      criteria_after: criteriaAfter,
    });

    reply.status(201);
    return {
      data: { success: true, session_id: sessionId, message: `Session logged for task ${p.task_id} (criteria: ${criteriaBefore}→${criteriaAfter})` },
      error: null,
    };
  });
}

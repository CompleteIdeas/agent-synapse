import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { findingCreateSchema, findingsQuerySchema, findingIdParamSchema } from '../schemas.js';

export function registerFindingsRoutes(app: FastifyInstance): void {

  // Agent reports a finding
  app.post('/finding', async (req, reply) => {
    const parsed = findingCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { agentId, category, severity, filePath, lineNumber, description, suggestion } = parsed.data;

    const db = getDb();

    db.prepare(
      `INSERT INTO findings (agent_id, category, severity, file_path, line_number, description, suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(agentId, category, severity ?? 'info', filePath ?? null, lineNumber ?? null, description, suggestion ?? null);

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'finding', ?)`
    ).run(agentId, `[${severity ?? 'info'}] ${category}: ${description.slice(0, 100)}`);

    return reply.code(201).send({ ok: true });
  });

  // Get all findings (filterable)
  app.get('/findings', async (req, reply) => {
    const q = findingsQuerySchema.safeParse(req.query);
    const { category, severity, status, limit } = q.success ? q.data : { category: undefined, severity: undefined, status: undefined, limit: 50 };

    const db = getDb();

    let sql = `
      SELECT f.id, f.category, f.severity, f.file_path, f.line_number,
             f.description, f.suggestion, f.status, f.created_at,
             a.name AS agent_name
      FROM findings f JOIN agents a ON f.agent_id = a.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (category) { sql += ` AND f.category = ?`; params.push(category); }
    if (severity) { sql += ` AND f.severity = ?`; params.push(severity); }
    if (status) { sql += ` AND f.status = ?`; params.push(status); }

    sql += ` ORDER BY
      CASE f.severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END,
      f.created_at DESC
      LIMIT ?`;
    params.push(limit);

    const findings = db.prepare(sql).all(...params);

    const stats = db.prepare(
      `SELECT severity, COUNT(*) as count FROM findings WHERE status = 'open' GROUP BY severity`
    ).all();

    return reply.send({ findings, stats });
  });

  // Resolve a finding
  app.post('/finding/:id/resolve', async (req, reply) => {
    const { id } = findingIdParamSchema.parse(req.params);

    const db = getDb();
    db.prepare(
      `UPDATE findings SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`
    ).run(id);

    return reply.send({ ok: true });
  });

  // Summary — quick counts by category and severity
  app.get('/findings/summary', async (_req, reply) => {
    const db = getDb();

    const bySeverity = db.prepare(
      `SELECT severity, COUNT(*) as count FROM findings WHERE status = 'open' GROUP BY severity`
    ).all();

    const byCategory = db.prepare(
      `SELECT category, COUNT(*) as count FROM findings WHERE status = 'open' GROUP BY category ORDER BY count DESC`
    ).all();

    const total = db.prepare(
      `SELECT COUNT(*) as total FROM findings WHERE status = 'open'`
    ).get() as { total: number };

    return reply.send({ total: total.total, bySeverity, byCategory });
  });
}

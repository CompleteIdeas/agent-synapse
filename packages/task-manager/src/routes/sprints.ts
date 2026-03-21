import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { sprintCreateSchema, sprintUpdateSchema, sprintNumberParamSchema, type Sprint, type Task } from '../types.js';

export function registerSprintRoutes(app: FastifyInstance): void {
  // GET /sprints
  app.get('/sprints', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM sprints ORDER BY sprint_number').all() as Sprint[];
    return { data: rows, error: null, meta: { count: rows.length } };
  });

  // POST /sprints
  app.post('/sprints', async (request, reply) => {
    const p = sprintCreateSchema.parse(request.body);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM sprints WHERE sprint_number = ?').get(p.sprint_number);
    if (existing) {
      reply.status(409);
      return { data: { success: false, message: `Sprint ${p.sprint_number} already exists` }, error: { code: 'CONFLICT', message: `Sprint ${p.sprint_number} already exists` } };
    }

    db.prepare(
      `INSERT INTO sprints (sprint_number, name, status, goal, start_date, end_date, sessions_planned, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(p.sprint_number, p.name, p.status, p.goal ?? null, p.start_date ?? null, p.end_date ?? null, p.sessions_planned, p.notes ?? null);

    reply.status(201);
    return { data: { success: true, message: `Sprint ${p.sprint_number} created` }, error: null };
  });

  // GET /sprints/:number
  app.get('/sprints/:number', async (request, reply) => {
    const { number: num } = sprintNumberParamSchema.parse(request.params);
    const db = getDb();

    const sprint = db.prepare('SELECT * FROM sprints WHERE sprint_number = ?').get(num) as Sprint | undefined;
    if (!sprint) {
      reply.status(404);
      return { data: null, error: { code: 'NOT_FOUND', message: `Sprint ${num} not found` } };
    }

    const tasks = db.prepare('SELECT * FROM tasks WHERE sprint_id = ? ORDER BY priority DESC, id ASC').all(sprint.id) as Task[];
    return { data: { ...sprint, tasks }, error: null };
  });

  // PUT /sprints/:number
  app.put('/sprints/:number', async (request, reply) => {
    const { number: num } = sprintNumberParamSchema.parse(request.params);
    const p = sprintUpdateSchema.parse(request.body);
    const db = getDb();

    const sprint = db.prepare('SELECT * FROM sprints WHERE sprint_number = ?').get(num) as Sprint | undefined;
    if (!sprint) { reply.status(404); return { data: { success: false, message: `Sprint ${num} not found` }, error: { code: 'NOT_FOUND', message: `Sprint ${num} not found` } }; }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (p.name !== undefined) { updates.push('name = ?'); values.push(p.name); }
    if (p.status !== undefined) { updates.push('status = ?'); values.push(p.status); }
    if (p.goal !== undefined) { updates.push('goal = ?'); values.push(p.goal); }
    if (p.start_date !== undefined) { updates.push('start_date = ?'); values.push(p.start_date); }
    if (p.end_date !== undefined) { updates.push('end_date = ?'); values.push(p.end_date); }
    if (p.sessions_planned !== undefined) { updates.push('sessions_planned = ?'); values.push(p.sessions_planned); }
    if (p.sessions_actual !== undefined) { updates.push('sessions_actual = ?'); values.push(p.sessions_actual); }
    if (p.notes !== undefined) { updates.push('notes = ?'); values.push(p.notes); }

    if (updates.length === 0) return { data: { success: true, message: 'Nothing to update' }, error: null };

    updates.push(`updated_at = datetime('now')`);
    values.push(num);

    db.prepare(`UPDATE sprints SET ${updates.join(', ')} WHERE sprint_number = ?`).run(...values);
    return { data: { success: true, message: `Sprint ${num} updated` }, error: null };
  });
}

import type { FastifyInstance } from 'fastify';
import { getDb, parseJson, logActivity } from '../db.js';
import { componentCreateSchema, componentUpdateSchema, componentListQuerySchema, type Component, type ComponentRow, type KnowledgeEntry, type KnowledgeRow, type Task } from '../types.js';

export function registerComponentRoutes(app: FastifyInstance): void {
  // POST /components
  app.post('/components', async (request, reply) => {
    const p = componentCreateSchema.parse(request.body);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM components WHERE id = ?').get(p.id);
    if (existing) {
      reply.status(409);
      return { data: { success: false, message: `Component ${p.id} already exists. Use PUT to update.` }, error: { code: 'CONFLICT', message: `Component ${p.id} already exists` } };
    }

    db.prepare(
      `INSERT INTO components (id, name, description, depends_on, doc_ref, phase, owner, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(p.id, p.name, p.description ?? null, p.depends_on ? JSON.stringify(p.depends_on) : null, p.doc_ref ?? null, p.phase ?? null, p.owner ?? null, p.status);

    logActivity(null, 'component_registered', p.owner ?? 'system', { component_id: p.id, name: p.name });
    reply.status(201);
    return { data: { success: true, message: `Component "${p.name}" registered as ${p.id}` }, error: null };
  });

  // GET /components
  app.get('/components', async (request) => {
    const q = componentListQuerySchema.parse(request.query);
    const db = getDb();
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];

    if (q.phase !== undefined) { conditions.push('phase = ?'); values.push(q.phase); }
    if (q.status) { conditions.push('status = ?'); values.push(q.status); }
    if (q.owner) { conditions.push('owner = ?'); values.push(q.owner); }

    const rows = db.prepare(
      `SELECT * FROM components WHERE ${conditions.join(' AND ')} ORDER BY phase, id`
    ).all(...values) as ComponentRow[];

    const components: Component[] = rows.map(r => ({
      ...r,
      depends_on: parseJson(r.depends_on, null),
    }));

    return { data: components, error: null, meta: { count: components.length } };
  });

  // GET /components/:id
  app.get('/components/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(id) as ComponentRow | undefined;
    if (!row) {
      reply.status(404);
      return { data: null, error: { code: 'NOT_FOUND', message: `Component ${id} not found` } };
    }

    const component: Component = { ...row, depends_on: parseJson(row.depends_on, null) };

    // Knowledge mentioning this component
    const knowledgeRows = db.prepare(
      `SELECT * FROM knowledge WHERE superseded_by IS NULL AND components LIKE ? ORDER BY created_at DESC`
    ).all(`%"${id}"%`) as KnowledgeRow[];

    const knowledge: KnowledgeEntry[] = knowledgeRows.map(r => ({
      ...r,
      components: parseJson(r.components, null),
      task_ids: parseJson(r.task_ids, null),
      doc_refs: parseJson(r.doc_refs, null),
      tags: parseJson(r.tags, null),
    }));

    // Tasks related to this component's doc_ref
    let tasks: Task[] = [];
    if (component.doc_ref) {
      tasks = db.prepare('SELECT * FROM tasks WHERE doc_ref = ? ORDER BY id').all(component.doc_ref) as Task[];
    }

    return { data: { component, knowledge, tasks }, error: null };
  });

  // PUT /components/:id
  app.put('/components/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const p = componentUpdateSchema.parse(request.body);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM components WHERE id = ?').get(id);
    if (!existing) { reply.status(404); return { data: { success: false, message: `Component ${id} not found` }, error: { code: 'NOT_FOUND', message: `Component ${id} not found` } }; }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (p.name !== undefined) { updates.push('name = ?'); values.push(p.name); }
    if (p.description !== undefined) { updates.push('description = ?'); values.push(p.description); }
    if (p.depends_on !== undefined) { updates.push('depends_on = ?'); values.push(JSON.stringify(p.depends_on)); }
    if (p.doc_ref !== undefined) { updates.push('doc_ref = ?'); values.push(p.doc_ref); }
    if (p.phase !== undefined) { updates.push('phase = ?'); values.push(p.phase); }
    if (p.owner !== undefined) { updates.push('owner = ?'); values.push(p.owner); }
    if (p.status !== undefined) { updates.push('status = ?'); values.push(p.status); }

    if (updates.length === 0) return { data: { success: true, message: 'Nothing to update' }, error: null };

    updates.push(`updated_at = datetime('now')`);
    values.push(id);

    db.prepare(`UPDATE components SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { data: { success: true, message: `Component ${id} updated` }, error: null };
  });
}

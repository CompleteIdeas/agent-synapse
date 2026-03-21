import type { FastifyInstance } from 'fastify';
import { getDb, parseJson, logActivity } from '../db.js';
import { knowledgeCreateSchema, knowledgeUpdateSchema, knowledgeQuerySchema, type KnowledgeEntry, type KnowledgeRow } from '../types.js';

export function registerKnowledgeRoutes(app: FastifyInstance): void {
  // POST /knowledge
  app.post('/knowledge', async (request, reply) => {
    const p = knowledgeCreateSchema.parse(request.body);
    const db = getDb();

    if (p.supersedes) {
      const old = db.prepare('SELECT id FROM knowledge WHERE id = ?').get(p.supersedes);
      if (!old) {
        reply.status(400);
        return { data: { success: false, message: `Knowledge entry ${p.supersedes} not found` }, error: { code: 'VALIDATION_ERROR', message: `Knowledge entry ${p.supersedes} not found` } };
      }
    }

    const result = db.prepare(
      `INSERT INTO knowledge (category, title, content, components, task_ids, doc_refs, tags, deposited_by, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.category, p.title, p.content,
      p.components ? JSON.stringify(p.components) : null,
      p.task_ids ? JSON.stringify(p.task_ids) : null,
      p.doc_refs ? JSON.stringify(p.doc_refs) : null,
      p.tags ? JSON.stringify(p.tags) : null,
      p.deposited_by, p.session_id ?? null,
    );
    const newId = Number(result.lastInsertRowid);

    if (p.supersedes) {
      db.prepare(`UPDATE knowledge SET superseded_by = ?, updated_at = datetime('now') WHERE id = ?`).run(newId, p.supersedes);
    }

    logActivity(null, 'knowledge_deposited', p.deposited_by, { knowledge_id: newId, category: p.category, title: p.title, supersedes: p.supersedes });
    reply.status(201);
    return { data: { success: true, message: `Knowledge deposited: "${p.title}"`, id: newId }, error: null };
  });

  // GET /knowledge
  app.get('/knowledge', async (request) => {
    const q = knowledgeQuerySchema.parse(request.query);
    const db = getDb();
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];

    if (q.include_superseded !== 'true') {
      conditions.push('superseded_by IS NULL');
    }
    if (q.category) { conditions.push('category = ?'); values.push(q.category); }
    if (q.component) {
      // SQLite JSON: check if components array contains the value
      conditions.push(`(components LIKE ? OR components LIKE ? OR components LIKE ?)`);
      values.push(`%"${q.component}"%`, `%"${q.component}"%`, `["${q.component}"]`);
    }
    if (q.task_id) {
      conditions.push(`(task_ids LIKE ? OR task_ids LIKE ? OR task_ids LIKE ?)`);
      values.push(`%"${q.task_id}"%`, `%"${q.task_id}"%`, `["${q.task_id}"]`);
    }
    if (q.doc_ref) {
      conditions.push(`(doc_refs LIKE ? OR doc_refs LIKE ? OR doc_refs LIKE ?)`);
      values.push(`%"${q.doc_ref}"%`, `%"${q.doc_ref}"%`, `["${q.doc_ref}"]`);
    }
    if (q.tag) {
      conditions.push(`(tags LIKE ? OR tags LIKE ? OR tags LIKE ?)`);
      values.push(`%"${q.tag}"%`, `%"${q.tag}"%`, `["${q.tag}"]`);
    }
    if (q.query) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      values.push(`%${q.query}%`, `%${q.query}%`);
    }

    const rows = db.prepare(
      `SELECT * FROM knowledge WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 50`
    ).all(...values) as KnowledgeRow[];

    // Parse JSON fields
    const entries: KnowledgeEntry[] = rows.map(r => ({
      ...r,
      components: parseJson(r.components, null),
      task_ids: parseJson(r.task_ids, null),
      doc_refs: parseJson(r.doc_refs, null),
      tags: parseJson(r.tags, null),
    }));

    return { data: entries, error: null, meta: { count: entries.length } };
  });

  // GET /knowledge/:id
  app.get('/knowledge/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const db = getDb();

    const row = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as KnowledgeRow | undefined;
    if (!row) {
      reply.status(404);
      return { data: null, error: { code: 'NOT_FOUND', message: `Knowledge entry ${id} not found` } };
    }

    const entry: KnowledgeEntry = {
      ...row,
      components: parseJson(row.components, null),
      task_ids: parseJson(row.task_ids, null),
      doc_refs: parseJson(row.doc_refs, null),
      tags: parseJson(row.tags, null),
    };

    return { data: entry, error: null };
  });

  // PUT /knowledge/:id
  app.put('/knowledge/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const p = knowledgeUpdateSchema.parse(request.body);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM knowledge WHERE id = ?').get(id);
    if (!existing) { reply.status(404); return { data: { success: false, message: `Knowledge entry ${id} not found` }, error: { code: 'NOT_FOUND', message: `Knowledge entry ${id} not found` } }; }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (p.title !== undefined) { updates.push('title = ?'); values.push(p.title); }
    if (p.content !== undefined) { updates.push('content = ?'); values.push(p.content); }
    if (p.category !== undefined) { updates.push('category = ?'); values.push(p.category); }
    if (p.components !== undefined) { updates.push('components = ?'); values.push(JSON.stringify(p.components)); }
    if (p.task_ids !== undefined) { updates.push('task_ids = ?'); values.push(JSON.stringify(p.task_ids)); }
    if (p.doc_refs !== undefined) { updates.push('doc_refs = ?'); values.push(JSON.stringify(p.doc_refs)); }
    if (p.tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(p.tags)); }

    if (updates.length === 0) return { data: { success: true, message: 'Nothing to update' }, error: null };

    updates.push(`updated_at = datetime('now')`);
    values.push(id);

    db.prepare(`UPDATE knowledge SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { data: { success: true, message: `Knowledge entry ${id} updated` }, error: null };
  });
}

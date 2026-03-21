import type { FastifyInstance } from 'fastify';
import { getDb, parseJson } from '../db.js';
import { activityQuerySchema, type ActivityLogEntry, type ActivityLogRow, type TeamView, type Component, type ComponentRow, type KnowledgeEntry, type KnowledgeRow } from '../types.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  // GET /dashboard/progress
  app.get('/dashboard/progress', async () => {
    const db = getDb();

    const rows = db.prepare(`
      SELECT phase,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'backlog' THEN 1 ELSE 0 END) as backlog,
        SUM(CASE WHEN status = 'requirements_review' THEN 1 ELSE 0 END) as requirements_review,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
      FROM tasks
      GROUP BY phase
      ORDER BY phase
    `).all();

    return { data: rows, error: null };
  });

  // GET /dashboard/team
  app.get('/dashboard/team', async () => {
    const db = getDb();

    const rows = db.prepare(`
      SELECT
        owner,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
      FROM tasks
      GROUP BY owner
      ORDER BY owner
    `).all() as TeamView[];

    return { data: rows, error: null };
  });

  // GET /activity
  app.get('/activity', async (request) => {
    const q = activityQuerySchema.parse(request.query);
    const db = getDb();

    let rows: ActivityLogRow[];
    if (q.task_id) {
      rows = db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC LIMIT ?').all(q.task_id, q.limit) as ActivityLogRow[];
    } else {
      rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(q.limit) as ActivityLogRow[];
    }

    const entries: ActivityLogEntry[] = rows.map(r => ({
      ...r,
      details: parseJson(r.details, null),
    }));

    return { data: entries, error: null, meta: { count: entries.length } };
  });

  // GET /health
  app.get('/health', async () => {
    const db = getDb();
    const taskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;
    return { status: 'ok', tasks: taskCount, timestamp: new Date().toISOString() };
  });

  // GET /architecture
  app.get('/architecture', async () => {
    const db = getDb();

    const compRows = db.prepare('SELECT * FROM components ORDER BY phase, id').all() as ComponentRow[];
    const components: Component[] = compRows.map(r => ({ ...r, depends_on: parseJson(r.depends_on, null) }));

    // Knowledge counts by category
    const catRows = db.prepare('SELECT category, COUNT(*) as count FROM knowledge WHERE superseded_by IS NULL GROUP BY category').all() as { category: string; count: number }[];
    const knowledge_counts: Record<string, number> = {};
    for (const r of catRows) knowledge_counts[r.category] = r.count;

    const totalKnowledge = (db.prepare('SELECT COUNT(*) as count FROM knowledge WHERE superseded_by IS NULL').get() as { count: number }).count;

    const recentRows = db.prepare('SELECT * FROM knowledge WHERE superseded_by IS NULL ORDER BY created_at DESC LIMIT 10').all() as KnowledgeRow[];
    const recent_deposits: KnowledgeEntry[] = recentRows.map(r => ({
      ...r,
      components: parseJson(r.components, null),
      task_ids: parseJson(r.task_ids, null),
      doc_refs: parseJson(r.doc_refs, null),
      tags: parseJson(r.tags, null),
    }));

    // Build dependency graph from components
    const dependency_graph: { from: string; to: string }[] = [];
    for (const comp of components) {
      if (comp.depends_on) {
        for (const dep of comp.depends_on) {
          dependency_graph.push({ from: comp.id, to: dep });
        }
      }
    }

    return {
      data: { components, knowledge_counts, total_knowledge: totalKnowledge, recent_deposits, dependency_graph },
      error: null,
    };
  });
}

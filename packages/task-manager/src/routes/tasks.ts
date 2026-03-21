import type { FastifyInstance } from 'fastify';
import { getDb, parseJson, logActivity } from '../db.js';
import {
  taskCreateSchema, taskUpdateSchema, taskStatusSchema, taskAssignSchema,
  taskListQuerySchema, taskSearchQuerySchema, subtaskCreateSchema, criteriaCreateSchema,
  taskIdParamSchema, taskNextQuerySchema, progressQuerySchema,
  type Task, type TaskDetail, type AcceptanceCriterion, type Question, type SessionRow,
} from '../types.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  backlog: ['requirements_review', 'ready', 'blocked'],
  requirements_review: ['ready', 'blocked', 'backlog'],
  ready: ['in_progress', 'blocked', 'backlog', 'requirements_review'],
  in_progress: ['review', 'done', 'blocked', 'ready'],
  review: ['done', 'in_progress', 'blocked'],
  done: ['in_progress'],
  blocked: ['backlog', 'requirements_review', 'ready', 'in_progress'],
};

export function registerTaskRoutes(app: FastifyInstance): void {
  // GET /tasks
  app.get('/tasks', async (request, reply) => {
    const q = taskListQuerySchema.parse(request.query);
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (q.status) { conditions.push('status = ?'); values.push(q.status); }
    if (q.owner) { conditions.push('owner = ?'); values.push(q.owner); }
    if (q.phase !== undefined) { conditions.push('phase = ?'); values.push(q.phase); }
    if (q.sprint_id !== undefined) { conditions.push('sprint_id = ?'); values.push(q.sprint_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(q.limit);

    const rows = db.prepare(
      `SELECT * FROM tasks ${where} ORDER BY priority DESC, id ASC LIMIT ?`
    ).all(...values) as Task[];

    return { data: rows, error: null, meta: { count: rows.length } };
  });

  // GET /tasks/next
  app.get('/tasks/next', async (request) => {
    const { owner } = taskNextQuerySchema.parse(request.query);
    const db = getDb();

    if (owner) {
      const row = db.prepare(
        `SELECT * FROM tasks WHERE status = 'ready' AND owner = ? ORDER BY priority DESC, id ASC LIMIT 1`
      ).get(owner) as Task | undefined;
      if (row) return { data: row, error: null };
    }

    const row = db.prepare(
      `SELECT * FROM tasks WHERE status = 'ready' AND (owner = 'unassigned' OR owner = ?)
       ORDER BY priority DESC, id ASC LIMIT 1`
    ).get(owner ?? 'unassigned') as Task | undefined;

    return { data: row ?? null, error: null };
  });

  // GET /tasks/progress
  app.get('/tasks/progress', async (request) => {
    const { phase: phaseNum } = progressQuerySchema.parse(request.query);
    const db = getDb();
    const phaseFilter = phaseNum !== undefined ? 'WHERE phase = ?' : '';
    const phaseValues = phaseNum !== undefined ? [phaseNum] : [];

    const total = (db.prepare(`SELECT COUNT(*) as count FROM tasks ${phaseFilter}`).get(...phaseValues) as { count: number }).count;

    const statusRows = db.prepare(`SELECT status, COUNT(*) as count FROM tasks ${phaseFilter} GROUP BY status`).all(...phaseValues) as { status: string; count: number }[];
    const by_status: Record<string, number> = {};
    for (const r of statusRows) by_status[r.status] = r.count;

    const ownerRows = db.prepare(`SELECT owner, COUNT(*) as count FROM tasks ${phaseFilter} GROUP BY owner`).all(...phaseValues) as { owner: string; count: number }[];
    const by_owner: Record<string, number> = {};
    for (const r of ownerRows) by_owner[r.owner] = r.count;

    const phaseRows = db.prepare(
      `SELECT phase, COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM tasks GROUP BY phase ORDER BY phase`
    ).all() as { phase: number; total: number; done: number }[];
    const by_phase: Record<number, { total: number; done: number }> = {};
    for (const r of phaseRows) by_phase[r.phase] = { total: r.total, done: r.done };

    const critTotal = phaseNum !== undefined
      ? (db.prepare('SELECT COUNT(*) as count FROM acceptance_criteria ac JOIN tasks t ON ac.task_id = t.id WHERE t.phase = ?').get(phaseNum) as { count: number }).count
      : (db.prepare('SELECT COUNT(*) as count FROM acceptance_criteria').get() as { count: number }).count;

    const critPassing = phaseNum !== undefined
      ? (db.prepare('SELECT COUNT(*) as count FROM acceptance_criteria ac JOIN tasks t ON ac.task_id = t.id WHERE ac.status = 1 AND t.phase = ?').get(phaseNum) as { count: number }).count
      : (db.prepare('SELECT COUNT(*) as count FROM acceptance_criteria WHERE status = 1').get() as { count: number }).count;

    const questionsPending = phaseNum !== undefined
      ? (db.prepare(`SELECT COUNT(*) as count FROM questions q JOIN tasks t ON q.task_id = t.id WHERE q.status = 'pending' AND t.phase = ?`).get(phaseNum) as { count: number }).count
      : (db.prepare(`SELECT COUNT(*) as count FROM questions WHERE status = 'pending'`).get() as { count: number }).count;

    return {
      data: { total, by_status, by_owner, by_phase, criteria_total: critTotal, criteria_passing: critPassing, questions_pending: questionsPending },
      error: null,
    };
  });

  // GET /tasks/search
  app.get('/tasks/search', async (request) => {
    const { q } = taskSearchQuerySchema.parse(request.query);
    const db = getDb();
    const pattern = `%${q}%`;

    const rows = db.prepare(
      `SELECT DISTINCT t.* FROM tasks t
       LEFT JOIN acceptance_criteria ac ON ac.task_id = t.id
       WHERE t.title LIKE ? OR t.description LIKE ? OR t.id LIKE ? OR ac.description LIKE ?
       ORDER BY t.priority DESC, t.id ASC LIMIT 25`
    ).all(pattern, pattern, pattern, pattern) as Task[];

    return { data: rows, error: null, meta: { count: rows.length } };
  });

  // POST /tasks
  app.post('/tasks', async (request, reply) => {
    const p = taskCreateSchema.parse(request.body);
    const db = getDb();

    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(p.id);
    if (existing) {
      reply.status(409);
      return { data: { success: false, message: `Task ${p.id} already exists` }, error: { code: 'CONFLICT', message: `Task ${p.id} already exists` } };
    }

    if (p.parent_id) {
      const parent = db.prepare('SELECT id FROM tasks WHERE id = ?').get(p.parent_id);
      if (!parent) {
        reply.status(404);
        return { data: { success: false, message: `Parent task ${p.parent_id} not found` }, error: { code: 'NOT_FOUND', message: `Parent task ${p.parent_id} not found` } };
      }
    }

    db.prepare(
      `INSERT INTO tasks (id, parent_id, sprint_id, phase, title, description, doc_ref, doc_section, owner, status, priority, estimated_effort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?)`
    ).run(p.id, p.parent_id ?? null, p.sprint_id ?? null, p.phase, p.title, p.description ?? null, p.doc_ref ?? null, p.doc_section ?? null, p.owner, p.priority, p.estimated_effort ?? null);

    if (p.criteria && p.criteria.length > 0) {
      const stmt = db.prepare('INSERT INTO acceptance_criteria (task_id, description, sort_order) VALUES (?, ?, ?)');
      for (let i = 0; i < p.criteria.length; i++) {
        stmt.run(p.id, p.criteria[i], i);
      }
    }

    logActivity(p.id, 'task_created', p.owner ?? 'system', { title: p.title, phase: p.phase });
    reply.status(201);
    return { data: { success: true, message: `Task ${p.id} created` }, error: null };
  });

  // GET /tasks/:id
  app.get('/tasks/:id', async (request, reply) => {
    const { id } = taskIdParamSchema.parse(request.params);
    const db = getDb();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) {
      reply.status(404);
      return { data: null, error: { code: 'NOT_FOUND', message: `Task ${id} not found` } };
    }

    const criteria = db.prepare('SELECT * FROM acceptance_criteria WHERE task_id = ? ORDER BY sort_order').all(id) as AcceptanceCriterion[];
    const questions = db.prepare('SELECT * FROM questions WHERE task_id = ? ORDER BY asked_at DESC').all(id) as Question[];
    const sessionRows = db.prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY started_at DESC').all(id) as SessionRow[];
    const subtasks = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY id ASC').all(id) as Task[];

    // Parse JSON fields in sessions
    const sessions = sessionRows.map(s => ({
      ...s,
      git_commits: parseJson(s.git_commits, null),
    }));

    const detail: TaskDetail = { ...task, criteria, questions, sessions, subtasks };
    return { data: detail, error: null };
  });

  // PUT /tasks/:id
  app.put('/tasks/:id', async (request, reply) => {
    const { id } = taskIdParamSchema.parse(request.params);
    const p = taskUpdateSchema.parse(request.body);
    const db = getDb();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) { reply.status(404); return { data: { success: false, message: `Task ${id} not found` }, error: { code: 'NOT_FOUND', message: `Task ${id} not found` } }; }

    const fields: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    const check = (field: string, newVal: unknown, oldVal: unknown) => {
      if (newVal !== undefined && newVal !== oldVal) {
        fields.push(`${field} = ?`);
        values.push(newVal);
        changes[field] = { from: oldVal, to: newVal };
      }
    };

    check('title', p.title, task.title);
    check('description', p.description, task.description);
    check('phase', p.phase, task.phase);
    check('sprint_id', p.sprint_id, task.sprint_id);
    check('doc_ref', p.doc_ref, task.doc_ref);
    check('doc_section', p.doc_section, task.doc_section);
    check('priority', p.priority, task.priority);
    check('estimated_effort', p.estimated_effort, task.estimated_effort);
    check('branch', p.branch, task.branch);

    if (Object.keys(changes).length === 0) {
      return { data: { success: true, message: `No changes to task ${id}` }, error: null };
    }

    values.push(id);
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    logActivity(id, 'task_updated', 'system', { changes });

    return { data: { success: true, message: `Task ${id} updated (${Object.keys(changes).join(', ')})` }, error: null };
  });

  // DELETE /tasks/:id
  app.delete('/tasks/:id', async (request, reply) => {
    const { id } = taskIdParamSchema.parse(request.params);
    const db = getDb();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) { reply.status(404); return { data: { success: false, message: `Task ${id} not found` }, error: { code: 'NOT_FOUND', message: `Task ${id} not found` } }; }

    const subtaskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE parent_id = ?').get(id) as { count: number }).count;
    if (subtaskCount > 0) {
      reply.status(409);
      return { data: { success: false, message: `Task ${id} has ${subtaskCount} subtasks. Delete them first.` }, error: { code: 'CONFLICT', message: `Task ${id} has subtasks` } };
    }

    db.prepare('DELETE FROM activity_log WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

    logActivity(null, 'task_deleted', 'system', { deleted_id: id, title: task.title, phase: task.phase });
    return { data: { success: true, message: `Task ${id} deleted` }, error: null };
  });

  // PUT /tasks/:id/status
  app.put('/tasks/:id/status', async (request, reply) => {
    const { id } = taskIdParamSchema.parse(request.params);
    const p = taskStatusSchema.parse(request.body);
    const db = getDb();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) { reply.status(404); return { data: { success: false, message: `Task ${id} not found` }, error: { code: 'NOT_FOUND', message: `Task ${id} not found` } }; }

    const allowed = VALID_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(p.status)) {
      reply.status(422);
      return {
        data: { success: false, message: `Cannot transition from ${task.status} to ${p.status}. Allowed: ${allowed.join(', ')}` },
        error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${task.status} to ${p.status}` },
      };
    }

    if (p.status === 'blocked' && p.reason) {
      db.prepare(`UPDATE tasks SET status = ?, blocked_reason = ?, updated_at = datetime('now') WHERE id = ?`).run(p.status, p.reason, id);
    } else if (task.status === 'blocked' && p.status !== 'blocked') {
      db.prepare(`UPDATE tasks SET status = ?, blocked_reason = NULL, updated_at = datetime('now') WHERE id = ?`).run(p.status, id);
    } else {
      db.prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(p.status, id);
    }

    logActivity(id, 'status_change', 'system', { from: task.status, to: p.status, reason: p.reason });
    return { data: { success: true, message: `Task ${id} moved to ${p.status}` }, error: null };
  });

  // PUT /tasks/:id/assign
  app.put('/tasks/:id/assign', async (request, reply) => {
    const { id } = taskIdParamSchema.parse(request.params);
    const { owner } = taskAssignSchema.parse(request.body);
    const db = getDb();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!task) { reply.status(404); return { data: { success: false, message: `Task ${id} not found` }, error: { code: 'NOT_FOUND', message: `Task ${id} not found` } }; }

    db.prepare(`UPDATE tasks SET owner = ?, updated_at = datetime('now') WHERE id = ?`).run(owner, id);
    logActivity(id, 'task_assigned', owner, { previous_owner: task.owner, new_owner: owner });

    return { data: { success: true, message: `Task ${id} assigned to ${owner}` }, error: null };
  });

  // POST /tasks/:id/subtasks
  app.post('/tasks/:id/subtasks', async (request, reply) => {
    const { id: parentId } = taskIdParamSchema.parse(request.params);
    const { subtasks } = subtaskCreateSchema.parse(request.body);
    const db = getDb();

    const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parentId) as Task | undefined;
    if (!parent) {
      reply.status(404);
      return { data: { success: false, message: `Parent task ${parentId} not found`, created: [] }, error: { code: 'NOT_FOUND', message: `Parent task ${parentId} not found` } };
    }

    const created: string[] = [];
    const insertTask = db.prepare(
      `INSERT INTO tasks (id, parent_id, sprint_id, phase, title, description, doc_ref, doc_section, status, priority, estimated_effort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?)`
    );
    const insertCriteria = db.prepare('INSERT INTO acceptance_criteria (task_id, description, sort_order) VALUES (?, ?, ?)');

    for (const sub of subtasks) {
      insertTask.run(sub.id, parentId, parent.sprint_id, parent.phase, sub.title, sub.description ?? null, parent.doc_ref, parent.doc_section, parent.priority, sub.estimated_effort ?? null);

      if (sub.criteria) {
        for (let i = 0; i < sub.criteria.length; i++) {
          insertCriteria.run(sub.id, sub.criteria[i], i);
        }
      }

      logActivity(sub.id, 'subtask_created', 'system', { parent_id: parentId, title: sub.title });
      created.push(sub.id);
    }

    reply.status(201);
    return { data: { success: true, message: `Created ${created.length} subtasks under ${parentId}`, created }, error: null };
  });

  // POST /tasks/:id/criteria
  app.post('/tasks/:id/criteria', async (request, reply) => {
    const { id: taskId } = taskIdParamSchema.parse(request.params);
    const { criteria } = criteriaCreateSchema.parse(request.body);
    const db = getDb();

    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      reply.status(404);
      return { data: { success: false, message: `Task ${taskId} not found`, added: 0 }, error: { code: 'NOT_FOUND', message: `Task ${taskId} not found` } };
    }

    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM acceptance_criteria WHERE task_id = ?').get(taskId) as { max_order: number };
    const maxOrder = maxRow.max_order;

    const stmt = db.prepare('INSERT INTO acceptance_criteria (task_id, description, sort_order) VALUES (?, ?, ?)');
    let added = 0;
    for (const desc of criteria) {
      stmt.run(taskId, desc, maxOrder + 1 + added);
      added++;
    }

    logActivity(taskId, 'criteria_added', 'system', { count: added, descriptions: criteria });
    reply.status(201);
    return { data: { success: true, message: `Added ${added} criteria to ${taskId}`, added }, error: null };
  });
}

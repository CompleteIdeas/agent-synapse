import type { FastifyInstance } from 'fastify';
import { getDb, logActivity } from '../db.js';
import { questionCreateSchema, questionAnswerSchema, questionResolveSchema, questionListQuerySchema, questionIdParamSchema, type Question } from '../types.js';

export function registerQuestionRoutes(app: FastifyInstance): void {
  // GET /questions
  app.get('/questions', async (request) => {
    const q = questionListQuerySchema.parse(request.query);
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (q.status) { conditions.push('status = ?'); values.push(q.status); }
    if (q.task_id) { conditions.push('task_id = ?'); values.push(q.task_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(q.limit);

    const rows = db.prepare(`SELECT * FROM questions ${where} ORDER BY asked_at DESC LIMIT ?`).all(...values) as Question[];
    return { data: rows, error: null, meta: { count: rows.length } };
  });

  // POST /questions
  app.post('/questions', async (request, reply) => {
    const p = questionCreateSchema.parse(request.body);
    const db = getDb();

    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(p.task_id);
    if (!task) {
      reply.status(404);
      return { data: { success: false, question_id: 0, message: `Task ${p.task_id} not found` }, error: { code: 'NOT_FOUND', message: `Task ${p.task_id} not found` } };
    }

    const result = db.prepare(
      `INSERT INTO questions (task_id, question, context, asked_by, status) VALUES (?, ?, ?, ?, 'pending')`
    ).run(p.task_id, p.question, p.context ?? null, p.asked_by);
    const questionId = Number(result.lastInsertRowid);

    logActivity(p.task_id, 'question_asked', p.asked_by, { question: p.question, question_id: questionId });
    reply.status(201);
    return { data: { success: true, question_id: questionId, message: `Question added to task ${p.task_id}` }, error: null };
  });

  // PUT /questions/:id/answer
  app.put('/questions/:id/answer', async (request, reply) => {
    const { id } = questionIdParamSchema.parse(request.params);
    const p = questionAnswerSchema.parse(request.body);
    const db = getDb();

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Question | undefined;
    if (!question) { reply.status(404); return { data: { success: false, message: `Question ${id} not found` }, error: { code: 'NOT_FOUND', message: `Question ${id} not found` } }; }

    db.prepare(
      `UPDATE questions SET answer = ?, answered_by = ?, answered_at = datetime('now'), status = 'answered' WHERE id = ?`
    ).run(p.answer, p.answered_by, id);

    logActivity(question.task_id, 'question_answered', p.answered_by, { question_id: id, question: question.question, answer: p.answer });
    return { data: { success: true, message: `Question ${id} answered` }, error: null };
  });

  // PUT /questions/:id/resolve
  app.put('/questions/:id/resolve', async (request, reply) => {
    const { id } = questionIdParamSchema.parse(request.params);
    const { resolved_by } = questionResolveSchema.parse(request.body);
    const db = getDb();

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Question | undefined;
    if (!question) { reply.status(404); return { data: { success: false, message: `Question ${id} not found` }, error: { code: 'NOT_FOUND', message: `Question ${id} not found` } }; }

    db.prepare(`UPDATE questions SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now') WHERE id = ?`).run(resolved_by, id);
    logActivity(question.task_id, 'question_resolved', resolved_by, { question_id: id, question: question.question });

    // Auto-advance from requirements_review to ready if no pending questions
    const pendingCount = (db.prepare(`SELECT COUNT(*) as count FROM questions WHERE task_id = ? AND status != 'resolved'`).get(question.task_id) as { count: number }).count;
    if (pendingCount === 0) {
      const updated = db.prepare(
        `UPDATE tasks SET status = 'ready', updated_at = datetime('now') WHERE id = ? AND status = 'requirements_review'`
      ).run(question.task_id);
      if (updated.changes > 0) {
        logActivity(question.task_id, 'status_change', 'system', { from: 'requirements_review', to: 'ready', reason: 'All questions resolved — auto-advanced' });
      }
    }

    return { data: { success: true, message: `Question ${id} resolved` }, error: null };
  });
}

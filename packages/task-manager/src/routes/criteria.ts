import type { FastifyInstance } from 'fastify';
import { getDb, logActivity } from '../db.js';
import { criteriaUpdateSchema, criteriaIdParamSchema, type AcceptanceCriterion } from '../types.js';

export function registerCriteriaRoutes(app: FastifyInstance): void {
  // PUT /criteria/:id
  app.put('/criteria/:id', async (request, reply) => {
    const { id } = criteriaIdParamSchema.parse(request.params);
    const p = criteriaUpdateSchema.parse(request.body);
    const db = getDb();

    const criterion = db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id) as AcceptanceCriterion | undefined;
    if (!criterion) { reply.status(404); return { data: { success: false, message: `Criterion ${id} not found` }, error: { code: 'NOT_FOUND', message: `Criterion ${id} not found` } }; }

    db.prepare(
      'UPDATE acceptance_criteria SET status = ?, verified_by = ?, verified_at = ? WHERE id = ?'
    ).run(p.status, p.verified_by ?? null, p.status === 1 ? new Date().toISOString() : null, id);

    logActivity(criterion.task_id, 'criteria_update', p.verified_by ?? 'system', {
      criteria_id: id,
      description: criterion.description,
      status: p.status === 1 ? 'passing' : 'failing',
    });

    return { data: { success: true, message: `Criterion ${id} marked ${p.status === 1 ? 'passing' : 'failing'}` }, error: null };
  });

  // DELETE /criteria/:id
  app.delete('/criteria/:id', async (request, reply) => {
    const { id } = criteriaIdParamSchema.parse(request.params);
    const db = getDb();

    const criterion = db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id) as AcceptanceCriterion | undefined;
    if (!criterion) { reply.status(404); return { data: { success: false, message: `Criterion ${id} not found` }, error: { code: 'NOT_FOUND', message: `Criterion ${id} not found` } }; }

    db.prepare('DELETE FROM acceptance_criteria WHERE id = ?').run(id);
    logActivity(criterion.task_id, 'criteria_deleted', 'system', { criteria_id: id, description: criterion.description });

    return { data: { success: true, message: `Criterion ${id} deleted` }, error: null };
  });
}

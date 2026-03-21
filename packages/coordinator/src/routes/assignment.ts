import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { assignCreateSchema, assignmentClaimSchema, assignmentUpdateSchema, assignmentIdParamSchema, assignmentQuerySchema } from '../schemas.js';

export function registerAssignmentRoutes(app: FastifyInstance): void {

  // Create a new assignment (orchestrator creates these)
  app.post('/assign', async (req, reply) => {
    const parsed = assignCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { agentId, task, description } = parsed.data;

    const db = getDb();
    const id = randomUUID();

    db.prepare(
      `INSERT INTO assignments (id, agent_id, task, description, status) VALUES (?, ?, ?, ?, ?)`
    ).run(id, agentId ?? null, task, description ?? null, agentId ? 'assigned' : 'pending');

    if (agentId) {
      db.prepare(
        `UPDATE agents SET status = 'working', current_task = ? WHERE id = ?`
      ).run(id, agentId);
    }

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'assignment_created', ?)`
    ).run(agentId ?? null, `task: ${task}`);

    return reply.code(201).send({ assignmentId: id, status: agentId ? 'assigned' : 'pending' });
  });

  // Agent asks "what should I work on?" — agentId comes from X-Agent-Id header or query
  app.get('/assignment', async (req, reply) => {
    const agentId = (req.headers['x-agent-id'] as string | undefined) ?? assignmentQuerySchema.parse(req.query).agentId;

    const db = getDb();

    // agentId is required — without it, don't expose unclaimed tasks
    if (!agentId) {
      return reply.send({ assignment: null });
    }

    // Get their current active assignment
    const active = db.prepare(
      `SELECT * FROM assignments WHERE agent_id = ? AND status IN ('assigned', 'in_progress') ORDER BY created_at DESC LIMIT 1`
    ).get(agentId);

    if (active) return reply.send({ assignment: active });

    // Auto-claim oldest unassigned task for this worker
    const pending = db.prepare(
      `SELECT * FROM assignments WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    ).get() as { id: string } | undefined;

    if (pending) {
      // Claim it for this worker atomically
      const claimed = db.prepare(
        `UPDATE assignments SET agent_id = ?, status = 'assigned', started_at = datetime('now') WHERE id = ? AND status = 'pending'`
      ).run(agentId, pending.id);

      if (claimed.changes > 0) {
        db.prepare(
          `UPDATE agents SET status = 'working', current_task = ? WHERE id = ?`
        ).run(pending.id, agentId);

        db.prepare(
          `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'assignment_claimed', ?)`
        ).run(agentId, `auto-claimed assignment ${pending.id}`);

        // Re-fetch the now-claimed assignment
        const assignment = db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(pending.id);
        return reply.send({ assignment });
      }
    }

    return reply.send({ assignment: null });
  });

  // Agent claims a pending assignment
  app.post('/assignment/:id/claim', async (req, reply) => {
    const { id } = assignmentIdParamSchema.parse(req.params);
    const parsed = assignmentClaimSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { agentId } = parsed.data;

    const db = getDb();

    const result = db.prepare(
      `UPDATE assignments SET agent_id = ?, status = 'assigned', started_at = datetime('now') WHERE id = ? AND status = 'pending'`
    ).run(agentId, id);

    if (result.changes === 0) {
      return reply.code(409).send({ error: 'assignment not available (already claimed or missing)' });
    }

    db.prepare(
      `UPDATE agents SET status = 'working', current_task = ? WHERE id = ?`
    ).run(id, agentId);

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'assignment_claimed', ?)`
    ).run(agentId, `claimed assignment ${id}`);

    return reply.send({ ok: true, assignmentId: id });
  });

  // Shared logic for updating an assignment's status
  function handleAssignmentUpdate(id: string, status: string, result: string | undefined) {
    const db = getDb();

    if (['completed', 'failed'].includes(status)) {
      db.prepare(
        `UPDATE assignments SET status = ?, result = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(status, result ?? null, id);
    } else {
      db.prepare(
        `UPDATE assignments SET status = ?, result = ? WHERE id = ?`
      ).run(status, result ?? null, id);
    }

    // If done, set agent back to idle
    if (['completed', 'failed'].includes(status)) {
      const assignment = db.prepare(`SELECT agent_id FROM assignments WHERE id = ?`).get(id) as { agent_id: string } | undefined;
      if (assignment?.agent_id) {
        db.prepare(
          `UPDATE agents SET status = 'idle', current_task = NULL WHERE id = ?`
        ).run(assignment.agent_id);
      }
    }

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES ((SELECT agent_id FROM assignments WHERE id = ?), 'assignment_update', ?)`
    ).run(id, `${id} → ${status}`);
  }

  // Agent reports progress or completion
  app.post('/assignment/:id/update', async (req, reply) => {
    const { id } = assignmentIdParamSchema.parse(req.params);
    const parsed = assignmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { status, result } = parsed.data;
    handleAssignmentUpdate(id, status, result);
    return reply.send({ ok: true });
  });

  // Alias: PATCH /assignment/:id — agents naturally try this
  app.patch('/assignment/:id', async (req, reply) => {
    const { id } = assignmentIdParamSchema.parse(req.params);
    const parsed = assignmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { status, result } = parsed.data;
    handleAssignmentUpdate(id, status, result);
    return reply.send({ ok: true });
  });

  // Alias: PUT /assignment/:id — agents also try this
  app.put('/assignment/:id', async (req, reply) => {
    const { id } = assignmentIdParamSchema.parse(req.params);
    const parsed = assignmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { status, result } = parsed.data;
    handleAssignmentUpdate(id, status, result);
    return reply.send({ ok: true });
  });
}

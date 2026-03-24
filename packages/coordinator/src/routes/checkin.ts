import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { checkinSchema, checkoutSchema } from '../schemas.js';

export function registerCheckinRoutes(app: FastifyInstance): void {

  // Register a new agent or heartbeat an existing one
  app.post('/checkin', async (req, reply) => {
    const parsed = checkinSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { name, role, pid, metadata, capabilities, workspace } = parsed.data;

    const db = getDb();
    const capsJson = capabilities ? JSON.stringify(capabilities) : null;

    // Check if agent already registered (by name + workspace + still alive)
    const existing = workspace
      ? db.prepare(
          `SELECT id, status FROM agents WHERE name = ? AND workspace = ? AND status != 'dead'`
        ).get(name, workspace) as { id: string; status: string } | undefined
      : db.prepare(
          `SELECT id, status FROM agents WHERE name = ? AND workspace IS NULL AND status != 'dead'`
        ).get(name) as { id: string; status: string } | undefined;

    if (existing) {
      // Heartbeat — update last_seen, and refresh capabilities if provided
      db.prepare(
        `UPDATE agents SET last_seen = datetime('now'), status = CASE WHEN status = 'dead' THEN 'idle' ELSE status END, pid = COALESCE(?, pid), capabilities = COALESCE(?, capabilities) WHERE id = ?`
      ).run(pid ?? null, capsJson, existing.id);

      db.prepare(
        `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'heartbeat', ?)`
      ).run(existing.id, `heartbeat from ${name}`);

      return reply.send({ agentId: existing.id, action: 'heartbeat', status: existing.status, workspace });
    }

    // New agent
    const id = randomUUID();
    db.prepare(
      `INSERT INTO agents (id, name, role, pid, status, metadata, capabilities, workspace) VALUES (?, ?, ?, ?, 'idle', ?, ?, ?)`
    ).run(id, name, role ?? 'worker', pid ?? null, metadata ? JSON.stringify(metadata) : null, capsJson, workspace ?? null);

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'registered', ?)`
    ).run(id, `${name} joined as ${role ?? 'worker'}${workspace ? ' [' + workspace + ']' : ''}${capabilities ? ' [' + capabilities.join(', ') + ']' : ''}`);

    return reply.code(201).send({ agentId: id, action: 'registered', status: 'idle', workspace });
  });

  // Agent signing off
  app.post('/checkout', async (req, reply) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { agentId } = parsed.data;

    const db = getDb();

    // Release all locks held by this agent
    db.prepare(`DELETE FROM locks WHERE agent_id = ?`).run(agentId);

    // Mark agent as dead
    db.prepare(
      `UPDATE agents SET status = 'dead', last_seen = datetime('now') WHERE id = ?`
    ).run(agentId);

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'checkout', 'agent signed off')`
    ).run(agentId);

    return reply.send({ ok: true });
  });
}

import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { commandCreateSchema, commandWaitQuerySchema } from '../schemas.js';

/**
 * Commands are orchestrator broadcasts that all agents must obey.
 *
 * Active commands:
 *   BUILD_FREEZE  — stop editing, commit & push, release locks, check in idle
 *   PAUSE         — stop work, hold position, don't commit yet
 *   RESUME        — clear freeze/pause, back to normal
 *   SHUTDOWN      — graceful exit: commit, push, checkout, terminate
 */

export function registerCommandRoutes(app: FastifyInstance): void {

  // Orchestrator issues a command to all agents (optionally scoped to a workspace)
  app.post('/command', async (req, reply) => {
    const parsed = commandCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { command, reason, issuedBy, workspace } = parsed.data;

    const db = getDb();

    // RESUME clears active commands (scoped to workspace if provided)
    if (command === 'RESUME') {
      if (workspace) {
        db.prepare(
          `UPDATE commands SET cleared_at = datetime('now') WHERE cleared_at IS NULL AND workspace = ?`
        ).run(workspace);
      } else {
        db.prepare(
          `UPDATE commands SET cleared_at = datetime('now') WHERE cleared_at IS NULL`
        ).run();
      }

      db.prepare(
        `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'command', ?)`
      ).run(issuedBy ?? null, `RESUME${workspace ? ' [' + workspace + ']' : ''} — commands cleared`);

      return reply.send({ ok: true, command: 'RESUME', workspace, message: workspace ? `commands cleared for ${workspace}` : 'all active commands cleared' });
    }

    // Issue new command (with optional workspace scope)
    db.prepare(
      `INSERT INTO commands (command, reason, issued_by, workspace) VALUES (?, ?, ?, ?)`
    ).run(command, reason ?? null, issuedBy ?? null, workspace ?? null);

    db.prepare(
      `INSERT INTO events (agent_id, event_type, detail) VALUES (?, 'command', ?)`
    ).run(issuedBy ?? null, `${command}${workspace ? ' [' + workspace + ']' : ''}: ${reason ?? 'no reason given'}`);

    return reply.code(201).send({ ok: true, command, reason, workspace });
  });

  // Agents poll this to check for active commands (optionally filtered by workspace)
  app.get('/command', async (req, reply) => {
    const workspace = (req.query as Record<string, string>).workspace;
    const db = getDb();

    const active = workspace
      ? db.prepare(
          `SELECT id, command, reason, issued_by, issued_at, workspace
           FROM commands WHERE cleared_at IS NULL AND (workspace = ? OR workspace IS NULL)
           ORDER BY issued_at DESC`
        ).all(workspace) as Array<{ id: number; command: string; reason: string; issued_by: string; issued_at: string; workspace: string | null }>
      : db.prepare(
          `SELECT id, command, reason, issued_by, issued_at, workspace
           FROM commands WHERE cleared_at IS NULL
           ORDER BY issued_at DESC`
        ).all() as Array<{ id: number; command: string; reason: string; issued_by: string; issued_at: string; workspace: string | null }>;

    if (active.length === 0) {
      return reply.send({ active: false, commands: [] });
    }

    // Return the highest-priority active command
    // Priority: SHUTDOWN > BUILD_FREEZE > PAUSE
    const priority: Record<string, number> = { SHUTDOWN: 3, BUILD_FREEZE: 2, PAUSE: 1 };
    active.sort((a, b) => (priority[b.command] ?? 0) - (priority[a.command] ?? 0));

    return reply.send({
      active: true,
      command: active[0].command,
      reason: active[0].reason,
      issued_at: active[0].issued_at,
      commands: active,
    });
  });

  // Wait for all agents to reach a target status (used after BUILD_FREEZE)
  app.get('/command/wait', async (req, reply) => {
    const q = commandWaitQuerySchema.safeParse(req.query);
    const { status: targetStatus, workspace } = q.success ? q.data : { status: 'idle', workspace: undefined };

    const db = getDb();

    const agents = workspace
      ? db.prepare(
          `SELECT id, name, role, status, current_task, last_seen
           FROM agents WHERE status NOT IN ('dead') AND workspace = ?
           ORDER BY name`
        ).all(workspace) as Array<{ id: string; name: string; role: string; status: string; current_task: string | null; last_seen: string }>
      : db.prepare(
          `SELECT id, name, role, status, current_task, last_seen
           FROM agents WHERE status NOT IN ('dead')
           ORDER BY name`
        ).all() as Array<{ id: string; name: string; role: string; status: string; current_task: string | null; last_seen: string }>;

    const ready = agents.filter(a => a.status === targetStatus || a.role === 'orchestrator');
    const notReady = agents.filter(a => a.status !== targetStatus && a.role !== 'orchestrator');

    return reply.send({
      allReady: notReady.length === 0,
      total: agents.length,
      ready: ready.map(a => ({ name: a.name, status: a.status })),
      waiting: notReady.map(a => ({ name: a.name, status: a.status, task: a.current_task })),
    });
  });
}

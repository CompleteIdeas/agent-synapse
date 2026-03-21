import Fastify from 'fastify';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZodError } from 'zod';
import { initDb, closeDb, getDb } from './db.js';
import { registerCheckinRoutes } from './routes/checkin.js';
import { registerAssignmentRoutes } from './routes/assignment.js';
import { registerLockRoutes } from './routes/lock.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerCommandRoutes } from './routes/command.js';
import { registerFindingsRoutes } from './routes/findings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.COORD_PORT ?? '8410', 10);
const DB_PATH = process.env.COORD_DB ?? resolve(__dirname, '..', 'data', 'coord.db');
const SESSION_START = new Date().toISOString();

export { SESSION_START };

const app = Fastify({ logger: true });

// ZodError handler — return 422 with validation details instead of 500 stack trace
app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(422).send({
      data: null,
      error: { code: 'VALIDATION_ERROR', message: error.issues[0].message, issues: error.issues },
    });
  }
  reply.status(error.statusCode ?? 500).send({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: error.message },
  });
});

// Initialize database
initDb(DB_PATH);

// Register all routes
registerCheckinRoutes(app);
registerAssignmentRoutes(app);
registerLockRoutes(app);
registerStatusRoutes(app);
registerCommandRoutes(app);
registerFindingsRoutes(app);

// Clean slate on startup — mark all agents from previous sessions as dead
function cleanSlate() {
  const db = getDb();
  const stale = db.prepare(
    `SELECT id, name FROM agents WHERE status != 'dead'`
  ).all() as Array<{ id: string; name: string }>;

  if (stale.length === 0) return;

  for (const agent of stale) {
    db.prepare(`UPDATE agents SET status = 'dead', current_task = NULL WHERE id = ?`).run(agent.id);
    db.prepare(`DELETE FROM locks WHERE agent_id = ?`).run(agent.id);
  }

  // Clear any active commands from previous session
  db.prepare(`UPDATE commands SET cleared_at = datetime('now') WHERE cleared_at IS NULL`).run();

  console.log(`  Clean slate: marked ${stale.length} agent(s) from previous session as dead`);
}

// Start
const start = async () => {
  try {
    cleanSlate();
    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`\n  Coordinator running → http://127.0.0.1:${PORT}`);
    console.log(`  Database → ${DB_PATH}`);
    console.log(`  Dashboard → http://127.0.0.1:${PORT}/status\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown — close Fastify first (drains connections), then DB
const shutdown = async () => {
  console.log('\nShutting down coordinator...');
  await app.close();
  closeDb();
  process.exit(0);
};

process.on('SIGINT', () => { shutdown(); });
process.on('SIGTERM', () => { shutdown(); });

start();

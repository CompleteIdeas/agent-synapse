import Fastify from 'fastify';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { timingSafeEqual } from 'crypto';
import { ZodError } from 'zod';
import { initDb, closeDb } from './db.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerCriteriaRoutes } from './routes/criteria.js';
import { registerQuestionRoutes } from './routes/questions.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerComponentRoutes } from './routes/components.js';
import { registerSprintRoutes } from './routes/sprints.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

// Re-export types and schemas for consumers
export type {
  TaskStatus, EffortSize, QuestionStatus, SprintStatus,
  KnowledgeCategory, ComponentStatus,
  Task, TaskDetail, AcceptanceCriterion, Question, Session,
  ActivityLogEntry, KnowledgeEntry, Component, Sprint, SprintDetail,
  ProgressStats, TeamView, ComponentDetail, ArchitectureMap,
} from './types.js';

export {
  taskStatusEnum, effortEnum, questionStatusEnum, sprintStatusEnum,
  knowledgeCategoryEnum, componentStatusEnum,
  taskCreateSchema, taskUpdateSchema, taskStatusSchema,
  taskAssignSchema, taskListQuerySchema, taskSearchQuerySchema,
  subtaskCreateSchema,
  criteriaCreateSchema, criteriaUpdateSchema,
  questionCreateSchema, questionAnswerSchema, questionResolveSchema, questionListQuerySchema,
  sessionCreateSchema,
  knowledgeCreateSchema, knowledgeUpdateSchema, knowledgeQuerySchema,
  componentCreateSchema, componentUpdateSchema, componentListQuerySchema,
  sprintCreateSchema, sprintUpdateSchema,
  taskIdParamSchema, criteriaIdParamSchema, questionIdParamSchema,
  knowledgeIdParamSchema, componentIdParamSchema, sprintNumberParamSchema,
  taskNextQuerySchema, activityQuerySchema, progressQuerySchema,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.TM_PORT ?? '8420', 10);
const DB_PATH = process.env.TM_DB_PATH ?? resolve(__dirname, '..', 'data', 'task.db');
const API_KEY = process.env.TM_API_KEY;

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

// Bearer token auth (optional — only enforced when TM_API_KEY is set)
if (API_KEY) {
  const expectedToken = Buffer.from(`Bearer ${API_KEY}`);
  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') return;

    const auth = request.headers.authorization ?? '';
    const authBuf = Buffer.from(auth);
    if (authBuf.length !== expectedToken.length || !timingSafeEqual(authBuf, expectedToken)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}

// Initialize database
initDb(DB_PATH);

// Register all routes
registerTaskRoutes(app);
registerCriteriaRoutes(app);
registerQuestionRoutes(app);
registerSessionRoutes(app);
registerKnowledgeRoutes(app);
registerComponentRoutes(app);
registerSprintRoutes(app);
registerDashboardRoutes(app);

// Start
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`\n  Task Manager running → http://127.0.0.1:${PORT}`);
    console.log(`  Database → ${DB_PATH}`);
    console.log(`  Auth → ${API_KEY ? 'Bearer token required' : 'Open (no TM_API_KEY set)'}`);
    console.log(`  Health → http://127.0.0.1:${PORT}/health\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down task manager...');
  closeDb();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();

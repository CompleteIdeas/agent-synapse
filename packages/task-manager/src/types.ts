import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────

export const taskStatusEnum = z.enum([
  'backlog', 'requirements_review', 'ready',
  'in_progress', 'review', 'done', 'blocked',
]);
export type TaskStatus = z.infer<typeof taskStatusEnum>;

export const effortEnum = z.enum(['S', 'M', 'L', 'XL']);
export type EffortSize = z.infer<typeof effortEnum>;

export const questionStatusEnum = z.enum(['pending', 'answered', 'resolved']);
export type QuestionStatus = z.infer<typeof questionStatusEnum>;

export const sprintStatusEnum = z.enum(['planned', 'active', 'completed']);
export type SprintStatus = z.infer<typeof sprintStatusEnum>;

export const knowledgeCategoryEnum = z.enum([
  'decision', 'dependency', 'assumption',
  'contract', 'concern', 'pattern', 'lesson',
]);
export type KnowledgeCategory = z.infer<typeof knowledgeCategoryEnum>;

export const componentStatusEnum = z.enum([
  'planned', 'in_progress', 'implemented', 'stable',
]);
export type ComponentStatus = z.infer<typeof componentStatusEnum>;

// ─── Interfaces ─────────────────────────────────────────────────

export interface Task {
  id: string;
  parent_id: string | null;
  sprint_id: number | null;
  phase: number;
  title: string;
  description: string | null;
  doc_ref: string | null;
  doc_section: string | null;
  owner: string;
  status: TaskStatus;
  priority: number;
  blocked_reason: string | null;
  branch: string | null;
  estimated_effort: EffortSize | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends Task {
  criteria: AcceptanceCriterion[];
  questions: Question[];
  sessions: Session[];
  subtasks: Task[];
}

export interface AcceptanceCriterion {
  id: number;
  task_id: string;
  description: string;
  status: number;
  verified_by: string | null;
  verified_at: string | null;
  sort_order: number;
}

export interface Question {
  id: number;
  task_id: string;
  question: string;
  context: string | null;
  asked_by: string;
  asked_at: string;
  answered_by: string | null;
  answer: string | null;
  answered_at: string | null;
  status: QuestionStatus;
}

export interface Session {
  id: number;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  git_commits: string[] | null;
  criteria_before: number;
  criteria_after: number;
  session_owner: string | null;
}

export interface ActivityLogEntry {
  id: number;
  task_id: string | null;
  action: string;
  actor: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface KnowledgeEntry {
  id: number;
  category: KnowledgeCategory;
  title: string;
  content: string;
  components: string[] | null;
  task_ids: string[] | null;
  doc_refs: string[] | null;
  tags: string[] | null;
  deposited_by: string;
  session_id: number | null;
  superseded_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface Component {
  id: string;
  name: string;
  description: string | null;
  depends_on: string[] | null;
  doc_ref: string | null;
  phase: number | null;
  owner: string | null;
  status: ComponentStatus;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: number;
  sprint_number: number;
  name: string;
  status: SprintStatus;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  sessions_planned: number;
  sessions_actual: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SprintDetail extends Sprint {
  tasks: Task[];
}

export interface ProgressStats {
  total: number;
  by_status: Record<string, number>;
  by_owner: Record<string, number>;
  by_phase: Record<number, { total: number; done: number }>;
  criteria_total: number;
  criteria_passing: number;
  questions_pending: number;
}

export interface TeamView {
  owner: string;
  total: number;
  in_progress: number;
  ready: number;
  blocked: number;
  done: number;
}

export interface ComponentDetail {
  component: Component;
  knowledge: KnowledgeEntry[];
  tasks: Task[];
}

export interface ArchitectureMap {
  components: Component[];
  knowledge_counts: Record<string, number>;
  total_knowledge: number;
  recent_deposits: KnowledgeEntry[];
  dependency_graph: { from: string; to: string }[];
}

// ─── DB Row Types (pre-JSON-parse) ──────────────────────────────
// These represent raw rows from SQLite before JSON fields are parsed.

/** Component row — depends_on is a JSON string before parsing */
export interface ComponentRow {
  id: string;
  name: string;
  description: string | null;
  depends_on: string | null;
  doc_ref: string | null;
  phase: number | null;
  owner: string | null;
  status: ComponentStatus;
  created_at: string;
  updated_at: string;
}

/** Knowledge row — JSON array fields are strings before parsing */
export interface KnowledgeRow {
  id: number;
  category: KnowledgeCategory;
  title: string;
  content: string;
  components: string | null;
  task_ids: string | null;
  doc_refs: string | null;
  tags: string | null;
  deposited_by: string;
  session_id: number | null;
  superseded_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Session row — git_commits is a JSON string before parsing */
export interface SessionRow {
  id: number;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  git_commits: string | null;
  criteria_before: number;
  criteria_after: number;
  session_owner: string | null;
}

/** Activity log row — details is a JSON string before parsing */
export interface ActivityLogRow {
  id: number;
  task_id: string | null;
  action: string;
  actor: string;
  details: string | null;
  created_at: string;
}

// ─── Zod Schemas ────────────────────────────────────────────────

// Tasks
export const taskCreateSchema = z.object({
  id: z.string().min(1).max(20),
  phase: z.coerce.number().int().min(1).max(10),
  title: z.string().min(1).max(500),
  description: z.string().nullish(),
  parent_id: z.string().max(20).nullish(),
  sprint_id: z.coerce.number().int().positive().nullish(),
  doc_ref: z.string().max(200).nullish(),
  doc_section: z.string().max(200).nullish(),
  estimated_effort: effortEnum.nullish(),
  priority: z.coerce.number().int().default(0),
  criteria: z.array(z.string().min(1).max(1000)).nullish(),
  owner: z.string().max(50).default('unassigned'),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullish(),
  phase: z.coerce.number().int().min(1).max(10).optional(),
  sprint_id: z.coerce.number().int().positive().nullish(),
  doc_ref: z.string().max(200).nullish(),
  doc_section: z.string().max(200).nullish(),
  priority: z.coerce.number().int().optional(),
  estimated_effort: effortEnum.nullish(),
  branch: z.string().max(200).nullish(),
});

export const taskStatusSchema = z.object({
  status: taskStatusEnum,
  reason: z.string().max(1000).optional(),
});

export const taskAssignSchema = z.object({
  owner: z.string().min(1).max(50),
});

export const taskListQuerySchema = z.object({
  status: taskStatusEnum.optional(),
  owner: z.string().max(50).optional(),
  phase: z.coerce.number().int().optional(),
  sprint_id: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const taskSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
});

export const subtaskCreateSchema = z.object({
  subtasks: z.array(z.object({
    id: z.string().min(1).max(20),
    title: z.string().min(1).max(500),
    description: z.string().nullish(),
    estimated_effort: effortEnum.nullish(),
    criteria: z.array(z.string().min(1).max(1000)).nullish(),
  })).min(1).max(50),
});

// Criteria
export const criteriaCreateSchema = z.object({
  criteria: z.array(z.string().min(1).max(1000)).min(1).max(50),
});

export const criteriaUpdateSchema = z.object({
  status: z.coerce.number().int().min(0).max(1),
  verified_by: z.string().max(50).optional(),
});

// Questions
export const questionCreateSchema = z.object({
  task_id: z.string().min(1).max(20),
  question: z.string().min(1).max(5000),
  context: z.string().max(5000).nullish(),
  asked_by: z.string().min(1).max(50),
});

export const questionAnswerSchema = z.object({
  answer: z.string().min(1).max(10000),
  answered_by: z.string().min(1).max(50),
});

export const questionResolveSchema = z.object({
  resolved_by: z.string().min(1).max(50),
});

export const questionListQuerySchema = z.object({
  status: questionStatusEnum.optional(),
  task_id: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Sessions
export const sessionCreateSchema = z.object({
  task_id: z.string().min(1).max(20),
  summary: z.string().min(1).max(10000),
  git_commits: z.array(z.string().max(100)).nullish(),
  criteria_completed: z.array(z.coerce.number().int().positive()).nullish(),
  session_owner: z.string().max(50).default('claude'),
});

// Knowledge
export const knowledgeCreateSchema = z.object({
  category: knowledgeCategoryEnum,
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  components: z.array(z.string().max(100)).nullish(),
  task_ids: z.array(z.string().max(20)).nullish(),
  doc_refs: z.array(z.string().max(200)).nullish(),
  tags: z.array(z.string().max(50)).nullish(),
  deposited_by: z.string().min(1).max(50),
  session_id: z.coerce.number().int().positive().nullish(),
  supersedes: z.coerce.number().int().positive().nullish(),
});

export const knowledgeUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(50000).optional(),
  category: knowledgeCategoryEnum.optional(),
  components: z.array(z.string().max(100)).nullish(),
  task_ids: z.array(z.string().max(20)).nullish(),
  doc_refs: z.array(z.string().max(200)).nullish(),
  tags: z.array(z.string().max(50)).nullish(),
});

export const knowledgeQuerySchema = z.object({
  category: knowledgeCategoryEnum.optional(),
  component: z.string().max(100).optional(),
  task_id: z.string().max(20).optional(),
  doc_ref: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  query: z.string().max(500).optional(),
  include_superseded: z.enum(['true', 'false']).default('false'),
});

// Components
export const componentCreateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  depends_on: z.array(z.string().max(100)).nullish(),
  doc_ref: z.string().max(200).nullish(),
  phase: z.coerce.number().int().min(1).max(10).nullish(),
  owner: z.string().max(50).nullish(),
  status: componentStatusEnum.default('planned'),
});

export const componentUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullish(),
  depends_on: z.array(z.string().max(100)).nullish(),
  doc_ref: z.string().max(200).nullish(),
  phase: z.coerce.number().int().min(1).max(10).nullish(),
  owner: z.string().max(50).nullish(),
  status: componentStatusEnum.optional(),
});

export const componentListQuerySchema = z.object({
  phase: z.coerce.number().int().optional(),
  status: componentStatusEnum.optional(),
  owner: z.string().max(50).optional(),
});

// Sprints
export const sprintCreateSchema = z.object({
  sprint_number: z.coerce.number().int().min(1).max(99),
  name: z.string().min(1).max(200),
  status: sprintStatusEnum.default('planned'),
  goal: z.string().max(5000).nullish(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullish(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullish(),
  sessions_planned: z.coerce.number().int().min(0).default(0),
  notes: z.string().max(10000).nullish(),
});

export const sprintUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: sprintStatusEnum.optional(),
  goal: z.string().max(5000).nullish(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullish(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullish(),
  sessions_planned: z.coerce.number().int().min(0).optional(),
  sessions_actual: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(10000).nullish(),
});

// Param schemas
export const taskIdParamSchema = z.object({ id: z.string().min(1).max(20) });
export const criteriaIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const questionIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const knowledgeIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const componentIdParamSchema = z.object({ id: z.string().min(1).max(100) });
export const sprintNumberParamSchema = z.object({ number: z.coerce.number().int().positive() });

// Activity / Progress
export const activityQuerySchema = z.object({
  task_id: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const taskNextQuerySchema = z.object({
  owner: z.string().max(50).optional(),
});

export const progressQuerySchema = z.object({
  phase: z.coerce.number().int().optional(),
});

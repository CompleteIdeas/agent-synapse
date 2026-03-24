// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * Engram — the fundamental unit of agent memory.
 *
 * An engram represents a single memory trace with salience metadata,
 * staging lifecycle, retraction support, and optional task management.
 */

export interface Engram {
  id: string;
  agentId: string;
  concept: string;
  content: string;
  embedding: number[] | null;

  // Cognitive scores
  confidence: number;    // 0-1 Bayesian posterior — updated on retrieval feedback
  salience: number;      // Write-time importance score
  accessCount: number;   // For ACT-R decay calculation
  lastAccessed: Date;
  createdAt: Date;

  // Salience audit trail
  salienceFeatures: SalienceFeatures;
  reasonCodes: string[];

  // Reinforcement (v0.5.0) — how many times near-duplicate writes boosted this memory
  reinforcementCount: number;

  // Lifecycle
  stage: EngramStage;
  ttl: number | null;    // Milliseconds — only for staging buffer entries

  // Scope (v0.5.0) — 'agent' (private) or 'workspace' (shared with all agents in workspace)
  scope: 'agent' | 'workspace';
  workspace: string | null;

  // Source provenance (v0.5.0) — where this memory came from
  source: EngramSource;

  // Negative memory
  retracted: boolean;
  retractedBy: string | null;   // ID of the engram that invalidated this one
  retractedAt: Date | null;

  // Tags for concept-based retrieval
  tags: string[];

  // Episode grouping
  episodeId: string | null;

  // Task management (null = not a task)
  taskStatus: TaskStatus | null;
  taskPriority: TaskPriority | null;
  blockedBy: string | null;   // ID of blocking engram/task
}

export type EngramStage = 'staging' | 'active' | 'consolidated' | 'archived' | 'profile';

/**
 * Source provenance — where a memory came from.
 */
export interface EngramSource {
  agent: string;
  task?: string;
  file?: string;
  context?: string;
}

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Raw feature scores that produced the salience score.
 * Persisted for auditability and tuning.
 */
export interface SalienceFeatures {
  surprise: number;
  decisionMade: boolean;
  causalDepth: number;
  resolutionEffort: number;
  eventType: string;
}

export interface EngramCreate {
  agentId: string;
  concept: string;
  content: string;
  tags?: string[];
  embedding?: number[];
  salience?: number;
  confidence?: number;
  salienceFeatures?: SalienceFeatures;
  reasonCodes?: string[];
  episodeId?: string;
  ttl?: number;
  taskStatus?: TaskStatus;
  taskPriority?: TaskPriority;
  blockedBy?: string;
  scope?: 'agent' | 'workspace';
  workspace?: string;
  source?: EngramSource;
}

/**
 * Association — weighted edge between two engrams.
 * Strengthened by Hebbian co-activation, decays when unused.
 * Capped at MAX_EDGES_PER_ENGRAM to prevent graph explosion.
 */
export interface Association {
  id: string;
  fromEngramId: string;
  toEngramId: string;
  weight: number;            // Log-space, updated via Hebbian rule
  confidence: number;        // Edge-level confidence (separate from node)
  type: AssociationType;
  activationCount: number;   // How many times this edge contributed to retrieval
  createdAt: Date;
  lastActivated: Date;
}

export type AssociationType = 'hebbian' | 'connection' | 'causal' | 'temporal' | 'invalidation' | 'bridge';

export const MAX_EDGES_PER_ENGRAM = 20;

/**
 * Activation result — returned from the activation pipeline.
 */
export interface ActivationResult {
  engram: Engram;
  score: number;
  phaseScores: PhaseScores;  // Per-phase breakdown for explainability
  why: string;               // Human-readable explanation
  associations: Association[];
}

/**
 * Per-phase scoring breakdown — full audit of how each phase contributed.
 */
export interface PhaseScores {
  textMatch: number;
  vectorMatch: number;
  decayScore: number;
  hebbianBoost: number;
  graphBoost: number;
  confidenceGate: number;
  composite: number;
  rerankerScore: number;   // Cross-encoder relevance (0-1), 0 if reranker disabled
}

export interface ActivationQuery {
  agentId: string;
  context: string;
  limit?: number;
  minScore?: number;
  includeStaging?: boolean;
  includeRetracted?: boolean;
  useReranker?: boolean;       // Enable cross-encoder re-ranking (default: true)
  useExpansion?: boolean;      // Enable query expansion (default: true)
  abstentionThreshold?: number; // Min reranker score to return results (default: 0)
  internal?: boolean;          // Skip access count increment, Hebbian update, and event logging (for system calls)
  workspace?: string;          // Include workspace-scoped memories in retrieval (v0.5.0)
}

/**
 * Search query — deterministic retrieval for diagnostics and debugging.
 * Separate from activation (which is cognitive/associative).
 */
export interface SearchQuery {
  agentId: string;
  text?: string;          // Exact or partial text match
  concept?: string;       // Exact concept match
  tags?: string[];        // Tag filter (AND)
  stage?: EngramStage;
  retracted?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Retrieval feedback — agent reports whether a memory was useful.
 * Used to update confidence scores and eval metrics.
 */
export interface RetrievalFeedback {
  engramId: string;
  useful: boolean;
  context: string;        // What the agent was doing when it judged usefulness
}

/**
 * Retraction — marks a memory as invalid/wrong.
 */
export interface Retraction {
  targetEngramId: string;
  reason: string;
  counterContent?: string;  // Optional: what the correct information is
  agentId: string;
}

/**
 * Episode — a temporal grouping of engrams from a session or time window.
 * Enables episode-first retrieval: find relevant episodes, then drill into engrams.
 */
export interface Episode {
  id: string;
  agentId: string;
  label: string;           // Short description (e.g., "Express migration session")
  embedding: number[] | null;  // Centroid of member engram embeddings
  engramCount: number;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
}

export interface EpisodeCreate {
  agentId: string;
  label: string;
  embedding?: number[];
}

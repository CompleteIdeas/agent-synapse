// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * Salience Filter — decides what's worth remembering.
 *
 * Codex feedback incorporated:
 *   - Persists raw feature scores for auditability
 *   - Returns reason codes for explainability
 *   - Thresholds are tunable per agent
 *   - Deterministic heuristics first, LLM augmentation optional
 */

import type { SalienceFeatures } from '../types/index.js';
import type { EngramStore } from '../storage/sqlite.js';

export type SalienceEventType = 'decision' | 'friction' | 'surprise' | 'causal' | 'observation';

export interface SalienceInput {
  content: string;
  eventType?: SalienceEventType;
  surprise?: number;
  decisionMade?: boolean;
  causalDepth?: number;
  resolutionEffort?: number;
  /** 0 = exact duplicate exists, 1 = completely novel. Computed by caller via BM25 similarity check. */
  novelty?: number;
}

export interface SalienceResult {
  score: number;
  disposition: 'active' | 'staging' | 'discard';
  features: SalienceFeatures;
  reasonCodes: string[];
}

/**
 * Weights for the salience scoring formula.
 * Novelty is the strongest signal — new information should always be stored.
 * Duplicates get filtered aggressively.
 */
const WEIGHTS = {
  surprise: 0.15,
  decision: 0.15,
  causalDepth: 0.15,
  resolutionEffort: 0.1,
  novelty: 0.45,
};

/**
 * Rule-based salience scorer with full audit trail.
 */
export function evaluateSalience(
  input: SalienceInput,
  activeThreshold: number = 0.4,
  stagingThreshold: number = 0.2
): SalienceResult {
  const features: SalienceFeatures = {
    surprise: input.surprise ?? 0,
    decisionMade: input.decisionMade ?? false,
    causalDepth: input.causalDepth ?? 0,
    resolutionEffort: input.resolutionEffort ?? 0,
    eventType: input.eventType ?? 'observation',
  };

  const reasonCodes: string[] = [];

  // Novelty: 1.0 = completely new info, 0 = exact duplicate exists
  // Default to 0.8 (assume mostly novel) when caller doesn't check
  const novelty = input.novelty ?? 0.8;

  // Score components
  const surpriseScore = WEIGHTS.surprise * features.surprise;
  const decisionScore = WEIGHTS.decision * (features.decisionMade ? 1.0 : 0);
  const causalScore = WEIGHTS.causalDepth * features.causalDepth;
  const effortScore = WEIGHTS.resolutionEffort * features.resolutionEffort;
  const noveltyScore = WEIGHTS.novelty * novelty;

  if (features.surprise > 0.5) reasonCodes.push('high_surprise');
  if (features.decisionMade) reasonCodes.push('decision_point');
  if (features.causalDepth > 0.5) reasonCodes.push('causal_insight');
  if (features.resolutionEffort > 0.5) reasonCodes.push('high_effort_resolution');
  if (novelty > 0.7) reasonCodes.push('novel_information');
  if (novelty < 0.3) reasonCodes.push('redundant_information');

  // Event type bonus
  let typeBonus = 0;
  switch (features.eventType) {
    case 'decision': typeBonus = 0.15; reasonCodes.push('event:decision'); break;
    case 'friction': typeBonus = 0.2; reasonCodes.push('event:friction'); break;
    case 'surprise': typeBonus = 0.25; reasonCodes.push('event:surprise'); break;
    case 'causal': typeBonus = 0.2; reasonCodes.push('event:causal'); break;
    case 'observation': break;
  }

  const score = Math.min(surpriseScore + decisionScore + causalScore + effortScore + noveltyScore + typeBonus, 1.0);

  let disposition: 'active' | 'staging' | 'discard';
  if (score >= activeThreshold) {
    disposition = 'active';
    reasonCodes.push('disposition:active');
  } else if (score >= stagingThreshold) {
    disposition = 'staging';
    reasonCodes.push('disposition:staging');
  } else {
    disposition = 'discard';
    reasonCodes.push('disposition:discard');
  }

  return { score, disposition, features, reasonCodes };
}

/**
 * Result from novelty computation with match info for reinforcement.
 */
export interface NoveltyResult {
  novelty: number;
  matchedEngramId: string | null;
  matchScore: number;
}

/**
 * Compute novelty score AND return the best matching engram (for reinforcement-on-duplicate).
 * Uses BM25 (synchronous, fast) to find the closest existing memory.
 *
 * Optionally checks workspace-scoped memories too (cross-agent dedup).
 */
export function computeNoveltyWithMatch(
  store: EngramStore, agentId: string, concept: string, content: string,
  workspace?: string | null
): NoveltyResult {
  try {
    const contentStr = typeof content === 'string' ? content : '';
    const conceptStr = typeof concept === 'string' ? concept : '';
    const searchText = `${conceptStr} ${contentStr.slice(0, 100)}`;

    // Agent-scoped search (limit:3 to avoid single shallow match suppressing novelty)
    const results = store.searchBM25WithRank(agentId, searchText, 3);

    // Also check workspace-scoped memories if workspace is set
    let wsResults: { engram: { id: string }; bm25Score: number }[] = [];
    if (workspace) {
      wsResults = store.searchBM25WithRank(agentId, searchText, 3, { includeWorkspace: workspace });
    }

    // Use the best match from either scope
    const allResults = [...results, ...wsResults];
    if (allResults.length === 0) return { novelty: 1.0, matchedEngramId: null, matchScore: 0 };

    allResults.sort((a, b) => b.bm25Score - a.bm25Score);
    const top = allResults[0];
    const topScore = top.bm25Score;

    let novelty: number;
    if (topScore > 0.95) novelty = 0.1;
    else if (topScore > 0.85) novelty = 0.3;
    else if (topScore > 0.70) novelty = 0.5;
    else if (topScore > 0.50) novelty = 0.7;
    else novelty = 0.9;

    return { novelty, matchedEngramId: top.engram.id, matchScore: topScore };
  } catch {
    return { novelty: 0.8, matchedEngramId: null, matchScore: 0 };
  }
}

/**
 * Backward-compatible wrapper — returns just the scalar novelty score.
 */
export function computeNovelty(store: EngramStore, agentId: string, concept: string, content: string): number {
  return computeNoveltyWithMatch(store, agentId, concept, content).novelty;
}

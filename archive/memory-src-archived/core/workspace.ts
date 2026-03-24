// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * Workspace derivation — extracts workspace namespace from agent ID.
 * Convention: "prefix:AgentName" → workspace is "prefix"
 * e.g., "work:Worker-A" → "work", "personal:orchestrator" → "personal"
 */

export function deriveWorkspace(agentId: string): string | null {
  const colonIdx = agentId.indexOf(':');
  if (colonIdx > 0) return agentId.slice(0, colonIdx);
  return null;
}

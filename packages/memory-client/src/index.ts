/**
 * AgentSynapse Memory Client — thin HTTP wrapper for standalone AWM.
 *
 * AWM (AgentWorkingMemory) runs as an external service. This client
 * provides typed access to its HTTP API for AgentSynapse services
 * that need programmatic memory access (coordinator, task-manager).
 *
 * Claude Code agents access AWM directly via MCP tools — they don't
 * use this client.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8400';

export interface MemoryClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface WriteResult {
  id: string;
  disposition: 'active' | 'staging' | 'discard';
  salience?: number;
}

export interface RecallResult {
  results: Array<{
    id: string;
    concept: string;
    content: string;
    score: number;
    salience?: number;
    confidence?: number;
    tags: string[];
    reasonCodes?: string[];
  }>;
}

export interface HealthResult {
  status: string;
  version?: string;
  uptime?: number;
}

export class MemoryClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: MemoryClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.AWM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async checkHealth(): Promise<HealthResult> {
    const res = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`AWM health check failed: ${res.status}`);
    return res.json() as Promise<HealthResult>;
  }

  async write(agentId: string, concept: string, content: string, options?: {
    tags?: string[];
    event_type?: string;
    salience?: number;
  }): Promise<WriteResult> {
    const res = await fetch(`${this.baseUrl}/memory/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, concept, content, ...options }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`AWM write failed: ${res.status}`);
    return res.json() as Promise<WriteResult>;
  }

  async recall(agentId: string, context: string, options?: {
    tags?: string[];
    limit?: number;
  }): Promise<RecallResult> {
    const res = await fetch(`${this.baseUrl}/memory/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, context, ...options }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`AWM recall failed: ${res.status}`);
    return res.json() as Promise<RecallResult>;
  }

  async checkpoint(agentId: string, state: {
    task?: string;
    decisions?: string[];
    files?: string[];
    notes?: string;
  }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/memory/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, ...state }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`AWM checkpoint failed: ${res.status}`);
  }

  async restore(agentId: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/memory/restore/${encodeURIComponent(agentId)}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`AWM restore failed: ${res.status}`);
    return res.json();
  }
}

export default MemoryClient;

// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * Synapse Push Adapter
 *
 * AWM plugin that bridges assignment events to MCP channel push notifications.
 * When an assignment is created and the target agent has a registered channel
 * session, the adapter pushes a notification to that agent's channel.
 *
 * Current state: logs push intent. Actual MCP channel push is deferred until
 * Claude Code --channels reaches GA.
 */

import type { PushConfig, ChannelSession, PushResult } from './types.js';

export type { PushConfig, ChannelSession, PushResult } from './types.js';

const DEFAULT_CONFIG: PushConfig = {
  coordinatorUrl: 'http://127.0.0.1:8400',
  enabled: true,
  pollIntervalMs: 2000,
  maxRetries: 3,
};

/**
 * Create a synapse-push adapter plugin.
 *
 * The plugin:
 * 1. Polls the AWM event feed for assignment_created events
 * 2. Looks up channel sessions for the assigned agent
 * 3. Logs push intent (actual MCP push deferred until --channels GA)
 *
 * @param userConfig Partial config — merged with defaults
 * @returns Plugin object with start/stop lifecycle methods
 */
export function createPushAdapter(userConfig: Partial<PushConfig> = {}) {
  const config: PushConfig = { ...DEFAULT_CONFIG, ...userConfig };
  let lastEventId = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  /** Fetch recent assignment events since lastEventId. */
  async function pollAssignmentEvents(): Promise<void> {
    if (!running || !config.enabled) return;

    try {
      const url = `${config.coordinatorUrl}/events?since_id=${lastEventId}&event_type=assignment_created&limit=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;

      const data = (await res.json()) as { events?: Array<{ id: number; agent_id: string | null; detail: string }> };
      const events = data.events ?? [];

      for (const event of events) {
        if (event.id > lastEventId) lastEventId = event.id;
        if (event.agent_id) {
          await handleAssignmentCreated(event.agent_id, event.detail);
        }
      }
    } catch {
      // Network error or timeout — silently retry next poll
    }
  }

  /** Check if agent has a channel session and log push intent. */
  async function handleAssignmentCreated(agentId: string, detail: string): Promise<PushResult> {
    const result: PushResult = { agentId, channelId: '', pushed: false };

    try {
      // Look up channel session
      const sessionsRes = await fetch(`${config.coordinatorUrl}/channel/sessions`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!sessionsRes.ok) {
        result.error = `channel/sessions returned ${sessionsRes.status}`;
        return result;
      }

      const sessionsData = (await sessionsRes.json()) as { sessions: ChannelSession[] };
      const session = sessionsData.sessions.find((s) => s.agent_id === agentId && s.status === 'connected');

      if (!session) {
        // No channel session — agent is polling, no push needed
        return result;
      }

      result.channelId = session.channel_id;

      // POST assignment to the channel server's local HTTP endpoint.
      // channel_id is http://127.0.0.1:{AWM_CHANNEL_PORT} — set during worker channel registration.
      const channelRes = await fetch(`${session.channel_id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `New assignment:\n\n${detail}`,
          meta: { source: 'awm-coordinator', agent: session.agent_name ?? agentId },
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (!channelRes.ok) {
        result.error = `channel push failed: ${channelRes.status}`;
        return result;
      }

      // Update push stats in coordinator
      await fetch(`${config.coordinatorUrl}/channel/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, message: `assignment: ${detail.slice(0, 500)}` }),
        signal: AbortSignal.timeout(3000),
      });

      result.pushed = true;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
  }

  return {
    /** Plugin name for AWM registration. */
    name: 'synapse-push' as const,

    /** Start polling for assignment events. */
    start(): void {
      if (running) return;
      running = true;
      console.log(`[synapse-push] Started (poll=${config.pollIntervalMs}ms, enabled=${config.enabled})`);
      // Initial poll, then interval
      void pollAssignmentEvents();
      pollTimer = setInterval(() => void pollAssignmentEvents(), config.pollIntervalMs);
    },

    /** Stop polling. */
    stop(): void {
      running = false;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      console.log('[synapse-push] Stopped');
    },

    /** Check if adapter is running. */
    isRunning(): boolean {
      return running;
    },

    /** Get current config. */
    getConfig(): Readonly<PushConfig> {
      return config;
    },

    /** Get the last processed event ID. */
    getLastEventId(): number {
      return lastEventId;
    },

    /** Exposed for testing — handle a single assignment event. */
    handleAssignmentCreated,
  };
}

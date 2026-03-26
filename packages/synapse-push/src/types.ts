// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * Type definitions for the synapse-push adapter.
 */

/** Configuration for the push adapter. */
export interface PushConfig {
  /** AWM coordination base URL (default: http://127.0.0.1:8400) */
  coordinatorUrl: string;

  /** Whether push is enabled. When false, the plugin logs but does not push. */
  enabled: boolean;

  /** Poll interval in ms for checking new assignment events (default: 2000) */
  pollIntervalMs: number;

  /** Maximum retries for a failed push attempt (default: 3) */
  maxRetries: number;
}

/** A channel session as returned by GET /channel/sessions. */
export interface ChannelSession {
  agent_id: string;
  agent_name: string;
  channel_id: string;
  connected_at: string;
  last_push_at: string | null;
  push_count: number;
  status: string;
}

/** An assignment event from the AWM coordination event feed. */
export interface AssignmentEvent {
  id: number;
  agent_id: string | null;
  event_type: string;
  detail: string;
  created_at: string;
}

/** Result of a push attempt. */
export interface PushResult {
  agentId: string;
  channelId: string;
  pushed: boolean;
  error?: string;
}

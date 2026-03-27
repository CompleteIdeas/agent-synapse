// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * AWM Plugin — synapse-push
 *
 * Wraps the push adapter as an AWM coordination plugin so it starts
 * automatically when AWM_COORDINATION=true and channels are enabled.
 *
 * Register by adding the compiled path to AWM_PLUGINS:
 *   AWM_PLUGINS=/path/to/synapse-push/dist/awm-plugin.js
 *
 * The adapter polls /events for assignment_created events and pushes
 * each assignment to the agent's registered channel server HTTP endpoint.
 * If no channel session exists for an agent, it silently skips (agent polled /next).
 */

import { createPushAdapter } from './index.js';

const adapter = createPushAdapter({
  coordinatorUrl: process.env.AWM_COORDINATOR_URL ?? 'http://127.0.0.1:8400',
  enabled: true,
  pollIntervalMs: 2000,
  maxRetries: 3,
});

export default {
  name: 'synapse-push',

  register(): void {
    adapter.start();
  },

  teardown(): void {
    adapter.stop();
  },
};

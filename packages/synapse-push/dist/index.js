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
const DEFAULT_CONFIG = {
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
export function createPushAdapter(userConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...userConfig };
    let lastEventId = 0;
    let pollTimer = null;
    let running = false;
    /** Fetch recent assignment events since lastEventId. */
    async function pollAssignmentEvents() {
        if (!running || !config.enabled)
            return;
        try {
            const url = `${config.coordinatorUrl}/events?since_id=${lastEventId}&event_type=assignment_created&limit=20`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                return;
            const data = (await res.json());
            const events = data.events ?? [];
            for (const event of events) {
                if (event.id > lastEventId)
                    lastEventId = event.id;
                if (event.agent_id) {
                    console.log(`[synapse-push] Event ${event.id}: agent=${event.agent_id}, pushing...`);
                    const result = await handleAssignmentCreated(event.agent_id, event.detail);
                    console.log(`[synapse-push] Push result: pushed=${result.pushed}, channel=${result.channelId}, error=${result.error ?? 'none'}`);
                }
                else {
                    console.log(`[synapse-push] Event ${event.id}: no agent_id, skipping`);
                }
            }
        }
        catch (err) {
            console.error(`[synapse-push] Poll error: ${err}`);
        }
    }
    /** Check if agent has a channel session and log push intent. */
    async function handleAssignmentCreated(agentId, detail) {
        const result = { agentId, channelId: '', pushed: false };
        try {
            // Look up channel session
            const sessionsRes = await fetch(`${config.coordinatorUrl}/channel/sessions`, {
                signal: AbortSignal.timeout(3000),
            });
            if (!sessionsRes.ok) {
                result.error = `channel/sessions returned ${sessionsRes.status}`;
                return result;
            }
            const sessionsData = (await sessionsRes.json());
            const session = sessionsData.sessions.find((s) => s.agent_id === agentId && s.status === 'connected');
            if (!session) {
                // No channel session — agent is polling, no push needed
                return result;
            }
            result.channelId = session.channel_id;
            console.log(`[synapse-push] Found session: agent=${agentId}, channel=${session.channel_id}, POSTing to ${session.channel_id}/push`);
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
        }
        catch (err) {
            result.error = err instanceof Error ? err.message : String(err);
        }
        return result;
    }
    return {
        /** Plugin name for AWM registration. */
        name: 'synapse-push',
        /** Start polling for assignment events. */
        start() {
            if (running)
                return;
            running = true;
            console.log(`[synapse-push] Started (poll=${config.pollIntervalMs}ms, enabled=${config.enabled})`);
            // Initial poll, then interval
            void pollAssignmentEvents();
            pollTimer = setInterval(() => void pollAssignmentEvents(), config.pollIntervalMs);
        },
        /** Stop polling. */
        stop() {
            running = false;
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            console.log('[synapse-push] Stopped');
        },
        /** Check if adapter is running. */
        isRunning() {
            return running;
        },
        /** Get current config. */
        getConfig() {
            return config;
        },
        /** Get the last processed event ID. */
        getLastEventId() {
            return lastEventId;
        },
        /** Exposed for testing — handle a single assignment event. */
        handleAssignmentCreated,
    };
}
//# sourceMappingURL=index.js.map
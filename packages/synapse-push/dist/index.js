// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * Synapse Push Adapter
 *
 * AWM plugin that bridges assignment events to MCP channel push notifications.
 * When an assignment is created and the target agent has a registered channel
 * session, the adapter pushes a notification to that agent's channel.
 *
 * Hardened against the 2026-06-18 hive-freeze incident: it no longer replays the
 * whole event backlog on (re)start (which hammered the coordinator with a
 * /channel/sessions lookup per event + 3s-timeout pushes to dead channels and
 * starved /next, /health, and MCP recall). It now (1) persists its position and
 * resumes with a BOUNDED catch-up — skipping straight to the latest event if the
 * gap is too large — (2) fetches channel sessions ONCE per poll instead of per
 * event, and (3) uses a short push timeout so a dead channel can't block the loop.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const DEFAULT_CONFIG = {
    coordinatorUrl: 'http://127.0.0.1:8400',
    enabled: true,
    pollIntervalMs: 2000,
    maxRetries: 3,
};
// How many missed events we're willing to push on resume. A larger gap (e.g. the
// coordinator was down a while, or this is a first run against a big backlog) is
// skipped to the latest event — workers fall back to polling /next, and replaying
// hundreds of stale pushes is exactly what froze the hive.
const CATCHUP_CAP = 50;
// Per-event page size used to advance the pointer (no pushes) — large so seeding is fast.
const SEED_PAGE = 200;
// Push to a (possibly dead) channel must fail fast so it can't block the poll loop.
const PUSH_TIMEOUT_MS = 1200;
// Where the last-processed event id is persisted across restarts.
const STATE_PATH = process.env.SYNAPSE_PUSH_STATE ?? '.synapse-push-state.json';
/**
 * Create a synapse-push adapter plugin.
 *
 * @param userConfig Partial config — merged with defaults
 * @returns Plugin object with start/stop lifecycle methods
 */
export function createPushAdapter(userConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...userConfig };
    let lastEventId = 0;
    let pollTimer = null;
    let running = false;
    function loadState() {
        try {
            const raw = readFileSync(STATE_PATH, 'utf8');
            const v = JSON.parse(raw).lastEventId;
            return typeof v === 'number' && v >= 0 ? v : null;
        }
        catch {
            return null; // no state file yet
        }
    }
    function saveState() {
        try {
            writeFileSync(STATE_PATH, JSON.stringify({ lastEventId }), 'utf8');
        }
        catch { /* best effort */ }
    }
    /** Page to the end of the assignment-event feed (NO pushes) and return the max id seen. */
    async function fetchMaxEventId(fromId) {
        let max = fromId;
        for (let guard = 0; guard < 1000; guard++) {
            const url = `${config.coordinatorUrl}/events?since_id=${max}&event_type=assignment_created&limit=${SEED_PAGE}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                break;
            const data = (await res.json());
            const events = data.events ?? [];
            for (const e of events)
                if (e.id > max)
                    max = e.id;
            if (events.length < SEED_PAGE)
                break;
        }
        return max;
    }
    /** Fetch the current connected channel sessions once (shared across a poll batch). */
    async function fetchSessions() {
        try {
            const res = await fetch(`${config.coordinatorUrl}/channel/sessions`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok)
                return [];
            const data = (await res.json());
            return data.sessions ?? [];
        }
        catch {
            return [];
        }
    }
    /** Poll for new assignment events and push to any connected channel. */
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
            if (events.length === 0)
                return;
            // One sessions lookup for the whole batch (not one per event).
            const sessions = events.some((e) => e.agent_id) ? await fetchSessions() : [];
            for (const event of events) {
                if (event.id > lastEventId)
                    lastEventId = event.id;
                if (!event.agent_id)
                    continue;
                const result = await handleAssignmentCreated(event.agent_id, event.detail, sessions);
                if (result.pushed || result.error) {
                    console.log(`[synapse-push] Event ${event.id}: pushed=${result.pushed}, channel=${result.channelId}, error=${result.error ?? 'none'}`);
                }
            }
            saveState();
        }
        catch (err) {
            console.error(`[synapse-push] Poll error: ${err}`);
        }
    }
    /**
     * Push an assignment to the agent's channel, if it has a connected session.
     * `sessions` may be passed in (poll batch) to avoid a per-event lookup; if
     * omitted (e.g. tests), it's fetched here.
     */
    async function handleAssignmentCreated(agentId, detail, sessions) {
        const result = { agentId, channelId: '', pushed: false };
        try {
            const list = sessions ?? (await fetchSessions());
            const session = list.find((s) => s.agent_id === agentId && s.status === 'connected');
            if (!session)
                return result; // no channel — agent is polling, no push needed
            result.channelId = session.channel_id;
            const channelRes = await fetch(`${session.channel_id}/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `New assignment:\n\n${detail}`,
                    meta: { source: 'awm-coordinator', agent: session.agent_name ?? agentId },
                }),
                signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
            });
            if (!channelRes.ok) {
                result.error = `channel push failed: ${channelRes.status}`;
                return result;
            }
            await fetch(`${config.coordinatorUrl}/channel/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, message: `assignment: ${detail.slice(0, 500)}` }),
                signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
            });
            result.pushed = true;
        }
        catch (err) {
            result.error = err instanceof Error ? err.message : String(err);
        }
        return result;
    }
    /**
     * Decide the starting position, then begin polling. Resume from the persisted
     * position if the catch-up gap is small; otherwise skip to the latest event so
     * a restart never floods the coordinator with stale pushes.
     */
    async function initThenPoll() {
        try {
            const persisted = loadState();
            const start = persisted ?? 0;
            const max = await fetchMaxEventId(start);
            if (persisted === null) {
                lastEventId = max;
                console.log(`[synapse-push] First run — seeded lastEventId=${max} (skipping backlog)`);
            }
            else if (max - persisted > CATCHUP_CAP) {
                lastEventId = max;
                console.log(`[synapse-push] Resume gap ${max - persisted} > cap ${CATCHUP_CAP} — skipping to latest=${max}`);
            }
            else {
                lastEventId = persisted;
                console.log(`[synapse-push] Resuming from lastEventId=${persisted} (gap ${max - persisted})`);
            }
            saveState();
        }
        catch (err) {
            console.error(`[synapse-push] init error: ${err}`);
        }
        if (!running)
            return;
        void pollAssignmentEvents();
        pollTimer = setInterval(() => void pollAssignmentEvents(), config.pollIntervalMs);
    }
    return {
        /** Plugin name for AWM registration. */
        name: 'synapse-push',
        /** Start polling for assignment events (bounded catch-up, then live). */
        start() {
            if (running)
                return;
            running = true;
            console.log(`[synapse-push] Started (poll=${config.pollIntervalMs}ms, enabled=${config.enabled})`);
            void initThenPoll();
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
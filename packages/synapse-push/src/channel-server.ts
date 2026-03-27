// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: Apache-2.0
/**
 * AWM Channel Server
 *
 * MCP server with the `claude/channel` capability, spawned by Claude Code when
 * workers launch with --dangerously-load-development-channels server:awm.
 *
 * Lifecycle:
 *   1. Reads AWM_CHANNEL_PORT from env (set by launcher), or finds a free port
 *   2. Starts an HTTP server on that port to receive push requests from synapse-push
 *   3. Connects to Claude Code via MCP stdio transport
 *   4. On POST /push: emits notifications/claude/channel to Claude Code
 *
 * Registration:
 *   The channel server does NOT self-register with the coordinator.
 *   The worker agent calls POST /channel/register with
 *   channelId = http://127.0.0.1:{AWM_CHANNEL_PORT} after receiving its agentId
 *   from /next. Synapse-push then pushes to that URL when an assignment arrives.
 *
 * Graceful degradation:
 *   - If Teams org has not enabled channels, Claude Code will not spawn this
 *     server and workers fall back to /next polling automatically — no errors.
 *   - If AWM_CHANNEL_PORT is not set, picks a free port (logged to stderr).
 *   - All HTTP errors return appropriate status codes.
 *   - MCP notification failures are reported to the caller without crashing.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as http from 'node:http';
import * as net from 'node:net';

const WORKER_NAME = process.env.WORKER_NAME ?? 'worker';

/** Find a free TCP port on 127.0.0.1. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

async function main(): Promise<void> {
  // Determine port — prefer launcher-assigned port for predictability
  const envPort = process.env.AWM_CHANNEL_PORT ? parseInt(process.env.AWM_CHANNEL_PORT, 10) : 0;
  const port = envPort > 0 && !isNaN(envPort) ? envPort : await getFreePort();

  // MCP server with claude/channel capability declared
  const server = new Server(
    { name: 'awm', version: '0.1.0' },
    {
      capabilities: {
        experimental: { 'claude/channel': {} },
      },
      instructions:
        `AWM coordination channel for ${WORKER_NAME}. ` +
        'Delivers task assignments directly from the AgentSynapse hive coordinator. ' +
        'When you receive a <channel source="awm"> message, treat it as a new ' +
        'assignment and begin work immediately — no need to poll /next.',
    }
  );

  // HTTP listener — receives push requests from the synapse-push coordinator adapter
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, worker: WORKER_NAME, port }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/push') {
      res.writeHead(404).end('Not found');
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      let parsed: { content: string; meta?: Record<string, string> };
      try {
        parsed = JSON.parse(body) as { content: string; meta?: Record<string, string> };
      } catch {
        res.writeHead(400).end('Invalid JSON');
        return;
      }

      if (!parsed.content) {
        res.writeHead(400).end('Missing content');
        return;
      }

      // Emit MCP channel notification — arrives in Claude as <channel source="awm">
      server
        .notification({
          method: 'notifications/claude/channel',
          params: { content: parsed.content, meta: parsed.meta ?? {} },
        })
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        })
        .catch((err: unknown) => {
          process.stderr.write(`[awm-channel] notification error: ${err}\n`);
          res.writeHead(500).end('Push failed');
        });
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, '127.0.0.1', resolve);
    httpServer.on('error', reject);
  });

  process.stderr.write(
    `[awm-channel] Listening on http://127.0.0.1:${port} (worker=${WORKER_NAME})\n`
  );

  // Connect MCP stdio transport — Claude Code subscribes to channel notifications
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Process stays alive serving HTTP until Claude Code disconnects the stdio transport
}

main().catch((err: unknown) => {
  process.stderr.write(`[awm-channel] Fatal: ${err}\n`);
  process.exit(1);
});

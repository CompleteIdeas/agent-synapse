import type { AgentCliAdapter, WorkerLaunchRequest } from '@agent-working-hive/core';

export const claudeCodeAdapter: AgentCliAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  executable: 'claude',
  wakeup: {
    kind: 'push-channel',
    notes: 'Prefer Claude channel/plugin wakeup when available; fall back to polling otherwise.',
  },
  instructionTargets: [
    { file: 'CLAUDE.md', required: true },
    { file: 'AGENTS.md', required: false },
  ],
  buildLaunchSpec(request: WorkerLaunchRequest) {
    const env: Record<string, string> = {
      AWM_COORDINATION: request.memory.coordination ? 'true' : 'false',
    };
    if (request.memory.workspace) env.AWM_WORKSPACE = request.memory.workspace;
    if (request.memory.dbPath) env.AWM_DB_PATH = request.memory.dbPath;

    const args = ['--dangerously-skip-permissions'];
    if (request.modelHint) {
      args.push('--model', request.modelHint);
    }

    return {
      command: 'claude',
      args,
      env,
      cwd: request.projectDir,
      stdio: 'inherit',
      interactive: true,
      wakeup: this.wakeup,
    };
  },
};

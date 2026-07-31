import type { AgentCliAdapter, WorkerLaunchRequest } from '@agent-working-hive/core';

export const codexAdapter: AgentCliAdapter = {
  id: 'codex',
  displayName: 'Codex',
  executable: 'codex',
  wakeup: {
    kind: 'polling',
    notes: 'Default to coordination polling unless Codex-specific wakeup support is added later.',
  },
  instructionTargets: [
    { file: 'AGENTS.md', required: true },
    { file: 'CLAUDE.md', required: false },
  ],
  buildLaunchSpec(request: WorkerLaunchRequest) {
    const env: Record<string, string> = {
      AWM_COORDINATION: request.memory.coordination ? 'true' : 'false',
    };
    if (request.memory.workspace) env.AWM_WORKSPACE = request.memory.workspace;
    if (request.memory.dbPath) env.AWM_DB_PATH = request.memory.dbPath;

    const args: string[] = [];

    return {
      command: 'codex',
      args,
      env,
      cwd: request.projectDir,
      stdio: 'inherit',
      interactive: true,
      wakeup: this.wakeup,
    };
  },
};

export type WakeupKind = 'push-channel' | 'http-mailbox' | 'polling' | 'none';

export interface WakeupStrategy {
  kind: WakeupKind;
  endpoint?: string;
  notes?: string;
}

export interface LaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
  interactive: boolean;
  wakeup: WakeupStrategy;
}

export interface WorkerLaunchRequest {
  workerName: string;
  workspace?: string;
  profile: string;
  projectDir: string;
  memory: {
    dbPath?: string;
    workspace?: string;
    coordination: boolean;
  };
  instructionFiles?: {
    claudeMd?: string;
    agentsMd?: string;
  };
  modelHint?: string;
}

export interface InstructionTarget {
  file: 'CLAUDE.md' | 'AGENTS.md' | 'other';
  pathHint?: string;
  required: boolean;
}

export interface AgentCliAdapter {
  id: string;
  displayName: string;
  executable: string;
  wakeup: WakeupStrategy;
  instructionTargets: InstructionTarget[];
  buildLaunchSpec(request: WorkerLaunchRequest): LaunchSpec;
}

import type { AgentCliAdapter, LaunchSpec, WorkerLaunchRequest } from './contracts.js';

export interface PortableLaunchPlan {
  adapterId: string;
  workerName: string;
  profile: string;
  spec: LaunchSpec;
}

export function createLaunchPlan(
  adapter: AgentCliAdapter,
  request: WorkerLaunchRequest,
): PortableLaunchPlan {
  return {
    adapterId: adapter.id,
    workerName: request.workerName,
    profile: request.profile,
    spec: adapter.buildLaunchSpec(request),
  };
}

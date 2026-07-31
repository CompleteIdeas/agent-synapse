export interface DeliveryVerdictRule {
  verdicts: Array<'PASS' | 'REVISE' | 'BLOCK'>;
  requiresRecallAtStart: true;
  requiresMemoryWriteOnPass: true;
  requiresChallengePhase: true;
}

export const firstClassDeliveryProfile: DeliveryVerdictRule = {
  verdicts: ['PASS', 'REVISE', 'BLOCK'],
  requiresRecallAtStart: true,
  requiresMemoryWriteOnPass: true,
  requiresChallengePhase: true,
};

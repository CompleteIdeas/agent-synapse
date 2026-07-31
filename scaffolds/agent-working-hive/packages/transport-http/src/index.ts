export interface MailboxEnvelope {
  workerName: string;
  content: string;
  workspace?: string;
  meta?: Record<string, unknown>;
}

export interface HttpWakeupTransport {
  kind: 'http-mailbox';
  postMessage(envelope: MailboxEnvelope): Promise<{ delivered: boolean; queued: boolean }>;
}

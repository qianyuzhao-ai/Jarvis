import { randomUUID } from 'node:crypto';
import type { ApprovalOutcome, ApprovalRequest } from '../../../shared/agent-approval';

/** Unanswered requests count as declined after this long. */
export const APPROVAL_TIMEOUT = 5 * 60_000;

/**
 * Tool calls waiting for the user's decision, kept per window. Every change calls `onChange` with
 * the owner so that window can be sent its current list; the main process is the only source.
 */
export class ApprovalQueue {
  onChange: (owner: number) => void = () => {};
  private pending = new Map<
    string,
    {
      owner: number;
      request: ApprovalRequest;
      finish: (outcome: ApprovalOutcome) => void;
    }
  >();
  constructor(private timeout = APPROVAL_TIMEOUT) {}
  request(
    owner: number,
    input: Omit<ApprovalRequest, 'id' | 'expiresAt'>,
    signal?: AbortSignal,
  ): Promise<ApprovalOutcome> {
    if (signal?.aborted) return Promise.resolve('denied');
    const request = { ...input, id: randomUUID(), expiresAt: Date.now() + this.timeout };
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish('expired'), this.timeout);
      const abort = () => finish('denied');
      const finish = (outcome: ApprovalOutcome) => {
        if (!this.pending.delete(request.id)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        this.onChange(owner);
        resolve(outcome);
      };
      this.pending.set(request.id, { owner, request, finish });
      signal?.addEventListener('abort', abort, { once: true });
      this.onChange(owner);
    });
  }
  list(owner: number) {
    return [...this.pending.values()].filter((e) => e.owner === owner).map((e) => e.request);
  }
  respond(owner: number, id: string, approved: boolean) {
    const entry = this.pending.get(id);
    if (!entry || entry.owner !== owner) throw new Error('确认请求已失效');
    entry.finish(approved ? 'approved' : 'denied');
  }
  /** Declines what a stopped conversation is waiting on. */
  cancelSession(sessionId: string) {
    for (const entry of [...this.pending.values()])
      if (entry.request.sessionId === sessionId) entry.finish('denied');
  }
  /** Declines everything a window is waiting on, for example when it closes or reloads. */
  cancelOwner(owner: number) {
    for (const entry of [...this.pending.values()])
      if (entry.owner === owner) entry.finish('denied');
  }
}

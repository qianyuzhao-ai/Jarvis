import { randomUUID } from 'node:crypto';
import {
  sameWritingScope,
  type WritingCommand,
  type WritingReply,
} from '../../shared/writing-agent';
export class WritingBroker {
  dispatch: (owner: number, command: WritingCommand) => void = () => {};
  private pending = new Map<
    string,
    {
      owner: number;
      command: WritingCommand;
      claimed: boolean;
      signal?: AbortSignal;
      resolve: (value: WritingReply) => void;
      reject: (error: Error) => void;
    }
  >();
  constructor(private timeout = 15000) {}
  async request(
    owner: number,
    input: Omit<WritingCommand, 'requestId' | 'expiresAt'>,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) throw new Error('操作已停止');
    const requestId = randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      const entry = this.pending.get(requestId);
      if (entry && !entry.claimed) entry.reject(new Error('操作已停止'));
    };
    try {
      return await new Promise<WritingReply>((resolve, reject) => {
        const command = { ...input, requestId, expiresAt: Date.now() + this.timeout };
        this.pending.set(requestId, { owner, command, claimed: false, signal, resolve, reject });
        timer = setTimeout(() => reject(new Error('写作回执超时，请检查当前文档')), this.timeout);
        signal?.addEventListener('abort', abort, { once: true });
        this.dispatch(owner, command);
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      this.pending.delete(requestId);
    }
  }
  claim(owner: number, id: string) {
    const e = this.pending.get(id);
    if (
      !e ||
      e.owner !== owner ||
      e.claimed ||
      e.signal?.aborted ||
      e.command.expiresAt < Date.now()
    )
      return false;
    e.claimed = true;
    return true;
  }
  complete(owner: number, reply: WritingReply) {
    const e = this.pending.get(reply.requestId);
    if (
      !e ||
      e.owner !== owner ||
      !e.claimed ||
      e.command.runId !== reply.runId ||
      !sameWritingScope(e.command.scope, reply.scope) ||
      e.command.expiresAt < Date.now()
    )
      throw new Error('写作回执已失效或作用域不匹配');
    e.resolve(reply);
  }
}

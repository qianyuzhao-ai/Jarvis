import { randomUUID } from 'node:crypto';
import type { CanvasCommand, CanvasReply } from '../../shared/canvas-agent';
export class CanvasBroker {
  dispatch: (owner: number, command: CanvasCommand) => void = () => {};
  private pending = new Map<
    string,
    {
      owner: number;
      projectId: string;
      claimed: boolean;
      signal?: AbortSignal;
      resolve: (value: CanvasReply) => void;
      reject: (error: Error) => void;
    }
  >();
  async request(
    owner: number,
    input: Omit<CanvasCommand, 'requestId' | 'expiresAt'>,
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
      return await new Promise<CanvasReply>((resolve, reject) => {
        this.pending.set(requestId, {
          owner,
          projectId: input.projectId,
          claimed: false,
          signal,
          resolve,
          reject,
        });
        timer = setTimeout(() => reject(new Error('画布回执超时，请检查当前项目')), 15000);
        signal?.addEventListener('abort', abort, { once: true });
        this.dispatch(owner, { ...input, requestId, expiresAt: Date.now() + 15000 });
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      this.pending.delete(requestId);
    }
  }
  claim(owner: number, id: string) {
    const entry = this.pending.get(id);
    if (!entry || entry.owner !== owner || entry.claimed || entry.signal?.aborted) return false;
    entry.claimed = true;
    return true;
  }
  complete(owner: number, reply: CanvasReply) {
    const entry = this.pending.get(reply.requestId);
    if (!entry || entry.owner !== owner || entry.projectId !== reply.projectId || !entry.claimed)
      throw new Error('画布回执已失效');
    if (reply.snapshot && reply.snapshot.projectId !== entry.projectId)
      throw new Error('画布项目不匹配');
    entry.resolve(reply);
  }
}

/** How many model requests may be in flight at once, across every conversation. */
export const DEFAULT_CONCURRENCY = 3;

/**
 * Limits concurrent model requests. A slot is held only while one request streams; tool calls,
 * approvals and pauses between requests do not hold one. Waiters are served first come, first
 * served, and `onChange` reports which keys (conversations) are waiting.
 */
export class Scheduler {
  onChange: () => void = () => {};
  private active = 0;
  private waiters: { key: string; grant: () => void }[] = [];
  constructor(private limit = DEFAULT_CONCURRENCY) {}
  setLimit(limit: number) {
    this.limit = limit;
    this.drain();
  }
  /** Keys currently waiting for a slot. */
  waiting() {
    return new Set(this.waiters.map((w) => w.key));
  }
  /** Resolves with a release function once a slot is free; aborting stops waiting. */
  acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new Error('请求已停止'));
    return new Promise((resolve, reject) => {
      const waiter = {
        key,
        grant: () => {
          signal?.removeEventListener('abort', abort);
          this.active++;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            this.active--;
            this.drain();
          });
        },
      };
      const abort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index < 0) return;
        this.waiters.splice(index, 1);
        this.onChange();
        reject(new Error('请求已停止'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.waiters.push(waiter);
      this.drain();
      if (this.waiters.includes(waiter)) this.onChange();
    });
  }
  private drain() {
    let changed = false;
    while (this.active < this.limit && this.waiters.length) {
      this.waiters.shift()?.grant();
      changed = true;
    }
    if (changed) this.onChange();
  }
}

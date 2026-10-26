import { DEFAULT_AGENT_SETTINGS } from '../../../shared/agent-settings';

/**
 * Who goes first when slots are short: 0 a session the user is looking at, 1 a session with a new
 * user message, 2 scheduled or external wakes, 3 background work.
 */
export type SlotPriority = 0 | 1 | 2 | 3;

/**
 * Limits concurrent model requests. A slot is held only while one request streams; tool calls,
 * decisions and pauses between requests do not hold one, and sessions waiting for a wake hold
 * nothing. Waiters are served by priority, then first come, first served; `onChange` reports
 * which keys (sessions) are waiting.
 */
export class Scheduler {
  onChange: () => void = () => {};
  private active = 0;
  private waiters: {
    key: string;
    priority: () => SlotPriority;
    order: number;
    grant: () => void;
  }[] = [];
  private order = 0;
  constructor(private limit = DEFAULT_AGENT_SETTINGS.concurrency) {}
  setLimit(limit: number) {
    this.limit = limit;
    this.drain();
  }
  /** Keys currently waiting for a slot. */
  waiting() {
    return new Set(this.waiters.map((w) => w.key));
  }
  /**
   * Resolves with a release function once a slot is free; aborting stops waiting. `priority` is
   * read whenever a slot frees, so a session the user opens meanwhile moves ahead.
   */
  acquire(
    key: string,
    signal?: AbortSignal,
    priority: () => SlotPriority = () => 2,
  ): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new Error('请求已停止'));
    return new Promise((resolve, reject) => {
      const waiter = {
        key,
        priority,
        order: this.order++,
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
      this.waiters.sort((a, b) => a.priority() - b.priority() || a.order - b.order);
      this.waiters.shift()?.grant();
      changed = true;
    }
    if (changed) this.onChange();
  }
}

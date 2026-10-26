import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  osMessageSchema,
  wakeReasonSchema,
  trustSchema,
  type OsMessage,
} from '../../../shared/agent-os';

/** A wake waiting in a session's inbox, stored so it survives a restart. */
export const queuedWakeSchema = z
  .object({
    id: z.string().uuid(),
    reason: wakeReasonSchema,
    trust: trustSchema,
    /** What the model receives, already wrapped in its trust envelope. */
    prompt: z.string().max(200_000),
    /** The conversation message this wake shows as, when it has one. */
    messageId: z.string().uuid().optional(),
    /** For user messages: a skill command is expanded when the round starts. */
    text: z.string().max(32000).optional(),
    priority: z.number().int().min(0).max(3),
    at: z.number(),
  })
  .strict();
export type QueuedWake = z.infer<typeof queuedWakeSchema>;

const entrySchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('msg'), m: osMessageSchema }),
  z.object({
    t: z.literal('round_start'),
    runId: z.string().uuid(),
    wakeId: z.string().uuid(),
    at: z.number(),
  }),
  z.object({
    t: z.literal('round_end'),
    runId: z.string().uuid(),
    status: z.string(),
    at: z.number(),
  }),
  z.object({ t: z.literal('wake'), w: queuedWakeSchema }),
  z.object({ t: z.literal('wake_taken'), id: z.string().uuid() }),
]);
type Entry = z.infer<typeof entrySchema>;

/** Rewrite the log from its current state once it grows past this many lines. */
const COMPACT_LINES = 4000;

export interface ReplayedSession {
  messages: OsMessage[];
  /** Wakes queued and not yet taken by a round. */
  inbox: QueuedWake[];
  /** The round that started and never ended, when the app stopped during it, with its wake. */
  unfinished: { runId: string; wakeId: string; at: number; wake?: QueuedWake } | null;
}

/**
 * One session's append-only event log: message upserts, round boundaries and queued wakes. The
 * log records what happened; the harness decides what the model sees. Appends are serialized per
 * file and a corrupt trailing line (a crash mid-write) is skipped on replay.
 */
export class SessionLog {
  private writes = Promise.resolve();
  private lines = 0;
  /** The file ends in a torn line (a crash mid-write); the next append starts a new line. */
  private torn = false;
  constructor(readonly path: string) {}
  async replay(): Promise<ReplayedSession> {
    let raw = '';
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const messages = new Map<string, OsMessage>();
    const order: string[] = [];
    const inbox = new Map<string, QueuedWake>();
    const wakes = new Map<string, QueuedWake>();
    let unfinished: ReplayedSession['unfinished'] = null;
    this.torn = raw.length > 0 && !raw.endsWith('\n');
    const rows = raw.split('\n').filter(Boolean);
    this.lines = rows.length;
    for (const row of rows) {
      let entry: Entry;
      try {
        entry = entrySchema.parse(JSON.parse(row));
      } catch {
        continue;
      }
      if (entry.t === 'msg') {
        if (!messages.has(entry.m.id)) order.push(entry.m.id);
        messages.set(entry.m.id, entry.m);
      } else if (entry.t === 'round_start')
        unfinished = { runId: entry.runId, wakeId: entry.wakeId, at: entry.at };
      else if (entry.t === 'round_end') {
        if (unfinished?.runId === entry.runId) unfinished = null;
      } else if (entry.t === 'wake') {
        inbox.set(entry.w.id, entry.w);
        wakes.set(entry.w.id, entry.w);
      } else inbox.delete(entry.id);
    }
    return {
      messages: order.flatMap((id) => {
        const message = messages.get(id);
        return message ? [message] : [];
      }),
      inbox: [...inbox.values()],
      unfinished: unfinished && { ...unfinished, wake: wakes.get(unfinished.wakeId) },
    };
  }
  private append(entries: Entry[]) {
    const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const pending = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const text = this.torn ? `\n${body}` : body;
      this.torn = false;
      await appendFile(this.path, text, { mode: 0o600 });
      this.lines += entries.length;
    });
    this.writes = pending.catch(() => {});
    return pending;
  }
  messages(messages: OsMessage[]) {
    return messages.length
      ? this.append(messages.map((m) => ({ t: 'msg' as const, m })))
      : Promise.resolve();
  }
  roundStart(runId: string, wakeId: string) {
    return this.append([{ t: 'round_start', runId, wakeId, at: Date.now() }]);
  }
  roundEnd(runId: string, status: string) {
    return this.append([{ t: 'round_end', runId, status, at: Date.now() }]);
  }
  wake(wake: QueuedWake) {
    return this.append([{ t: 'wake', w: wake }]);
  }
  taken(id: string) {
    return this.append([{ t: 'wake_taken', id }]);
  }
  /** Rewrites the log from the current state when it has grown long. */
  async compact(state: { messages: OsMessage[]; inbox: QueuedWake[] }) {
    if (this.lines < COMPACT_LINES) return;
    const pending = this.writes.then(async () => {
      const entries: Entry[] = [
        ...state.messages.map((m) => ({ t: 'msg' as const, m })),
        ...state.inbox.map((w) => ({ t: 'wake' as const, w })),
      ];
      const text = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
      await writeFile(`${this.path}.tmp`, text, { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
      this.lines = entries.length;
    });
    this.writes = pending.catch(() => {});
    return pending;
  }
  settled() {
    return this.writes;
  }
  async size() {
    return (await stat(this.path).catch(() => null))?.size ?? 0;
  }
}

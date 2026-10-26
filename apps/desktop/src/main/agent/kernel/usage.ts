import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  usageRoleSchema,
  type UsageAmount,
  type UsageQuery,
  type UsageSummary,
} from '../../../shared/agent-usage';

const count = z.number().int().min(0);
const entrySchema = z
  .object({
    at: z.number(),
    role: usageRoleSchema,
    projectId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    provider: z.string().max(200),
    model: z.string().max(200),
    input: count,
    output: count,
    cacheRead: count,
    cacheWrite: count,
    tokens: count,
    /** US dollars; null when the model has no price (custom relays). */
    cost: z.number().min(0).nullable(),
  })
  .strict();
export type UsageEntry = z.infer<typeof entrySchema>;

/** What a summary shows for IDs in the ledger; projects and threads may have been removed since. */
export interface UsageNames {
  project(id: string): string | undefined;
  thread(id: string): { title: string; projectId: string } | undefined;
}

/** The longest span drawn day by day; longer spans of "all" are drawn by month. */
const MAX_DAYS = 31;
const DAY_RANGES = { today: 1, '7d': 7, '30d': 30 } as const;

const monthOf = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);
const addDays = (time: number, days: number) => {
  const d = new Date(time);
  d.setDate(d.getDate() + days);
  return d.getTime();
};
const startOfMonth = (time: number) => {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
const addMonths = (time: number, months: number) => {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
};
const amount = (): UsageAmount => ({ tokens: 0, cost: null });
const add = (to: UsageAmount, entry: UsageEntry) => {
  to.tokens += entry.tokens;
  if (entry.cost !== null) to.cost = (to.cost ?? 0) + entry.cost;
};

/**
 * Token usage of every model reply, appended to `<dir>/<YYYY-MM>.jsonl` by local month. Only
 * counts, IDs and model names are kept, never conversation text. Appends are serialized; each one
 * starts on a new line, so a line torn by a crash is skipped instead of joined to the next.
 */
export class UsageLedger {
  private writes = Promise.resolve();
  constructor(readonly dir: string) {}

  record(entry: UsageEntry) {
    const line = JSON.stringify(entrySchema.parse(entry));
    const pending = this.writes.then(async () => {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      await appendFile(join(this.dir, `${monthOf(entry.at)}.jsonl`), `\n${line}`, { mode: 0o600 });
    });
    this.writes = pending.catch(() => {});
    return pending;
  }
  settled() {
    return this.writes;
  }

  /** Month files, oldest first. */
  private async files() {
    await this.writes;
    try {
      return (await readdir(this.dir)).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  private async read(file: string) {
    const entries: UsageEntry[] = [];
    const raw = await readFile(join(this.dir, file), 'utf8');
    for (const row of raw.split('\n')) {
      if (!row) continue;
      try {
        entries.push(entrySchema.parse(JSON.parse(row)));
      } catch {}
    }
    return entries;
  }

  async summary(query: UsageQuery, names: UsageNames, now = Date.now()): Promise<UsageSummary> {
    const today = startOfDay(now);
    const days = query.range === 'all' ? null : DAY_RANGES[query.range];
    const from = days === null ? null : addDays(today, 1 - days);
    const files = await this.files();
    const fromMonth = from === null ? '' : monthOf(from);
    const read = files.filter((f) => f.slice(0, 7) >= fromMonth);
    const all = (await Promise.all(read.map((f) => this.read(f)))).flat();
    // The first record ever, which may sit in a month before the range.
    const oldest = files[0] && files[0] !== read[0] ? await this.read(files[0]) : all;
    const since = oldest.reduce<number | null>(
      (min, e) => (min === null || e.at < min ? e.at : min),
      null,
    );
    const entries = all.filter(
      (e) =>
        (from === null || e.at >= from) &&
        e.at < addDays(today, 1) &&
        (query.projectId === null || e.projectId === query.projectId),
    );

    // Buckets: days for fixed ranges and short spans, months for a long "all".
    const first = from ?? startOfDay(since ?? now);
    const unit: 'day' | 'month' =
      from === null && addDays(first, MAX_DAYS) <= today ? 'month' : 'day';
    const starts: number[] = [];
    if (unit === 'day') for (let t = first; t <= today; t = addDays(t, 1)) starts.push(t);
    else for (let t = startOfMonth(first); t <= today; t = addMonths(t, 1)) starts.push(t);
    const buckets = starts.map((start) => ({ start, unit, coordinator: 0, thread: 0, other: 0 }));

    const total = amount();
    const roles = { coordinator: amount(), thread: amount(), other: amount() };
    const models = new Map<string, UsageSummary['models'][number]>();
    const projects = new Map<string, UsageAmount>();
    const threads = new Map<string, UsageAmount & { projectId: string }>();
    for (const entry of entries) {
      add(total, entry);
      add(roles[entry.role], entry);
      const start = unit === 'day' ? startOfDay(entry.at) : startOfMonth(entry.at);
      const bucket = buckets.find((b) => b.start === start);
      if (bucket) bucket[entry.role] += entry.tokens;
      const key = `${entry.provider}\u0000${entry.model}`;
      const model = models.get(key) ?? {
        provider: entry.provider,
        model: entry.model,
        input: 0,
        output: 0,
        cache: 0,
        tokens: 0,
        cost: null,
      };
      model.input += entry.input;
      model.output += entry.output;
      model.cache += entry.cacheRead + entry.cacheWrite;
      add(model, entry);
      models.set(key, model);
      if (entry.role === 'coordinator' && entry.projectId) {
        const project = projects.get(entry.projectId) ?? amount();
        add(project, entry);
        projects.set(entry.projectId, project);
      }
      if (entry.role === 'thread' && entry.sessionId && entry.projectId) {
        const thread = threads.get(entry.sessionId) ?? { ...amount(), projectId: entry.projectId };
        add(thread, entry);
        threads.set(entry.sessionId, thread);
      }
    }
    const byTokens = (a: { tokens: number }, b: { tokens: number }) => b.tokens - a.tokens;
    const projectTitle = (id: string) => names.project(id) ?? '已删除的项目';
    const modelList = [...models.values()].sort(byTokens);
    return {
      range: query.range,
      projectId: query.projectId,
      since,
      total: { ...total, unpricedModels: modelList.filter((m) => m.cost === null).length },
      ...roles,
      buckets,
      models: modelList,
      projects: [...projects]
        .map(([projectId, value]) => ({ projectId, title: projectTitle(projectId), ...value }))
        .sort(byTokens),
      threads: [...threads]
        .map(([threadId, { projectId, ...value }]) => ({
          threadId,
          projectId,
          title: names.thread(threadId)?.title ?? '已删除的线程',
          projectTitle: projectTitle(projectId),
          ...value,
        }))
        .sort(byTokens)
        .slice(0, 5),
    };
  }
}

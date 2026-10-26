import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { wakeSpecSchema, type WakeSpec } from '../../../shared/agent-os';
import { JsonFile, readJson } from '../json-file';

const fileSchema = z.object({ version: z.literal(1), wakes: z.array(wakeSpecSchema) });
/** Timers are re-armed at least this often, so sleep and clock changes catch up. */
const MAX_TIMER = 60 * 60_000;
const SUBSCRIPTION_DAYS = 30;
const MAX_WAKES_PER_TARGET = 20;

type Field = { min: number; max: number };
const FIELDS: Field[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
];

function parseField(text: string, { min, max }: Field) {
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const [range = '', stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error('cron 步长不正确');
    let from = min;
    let to = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      from = Number(a);
      to = b === undefined ? (stepText === undefined ? from : max) : Number(b);
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to)
      throw new Error('cron 字段超出范围');
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

/** Parses a five-field cron expression (minute hour day month weekday, local time). */
export function parseCron(expression: string) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 需要 5 个字段：分 时 日 月 周');
  const [minute, hour, day, month, weekday] = parts.map((p, i) =>
    parseField(p, FIELDS[i] as Field),
  ) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  // Like cron: when both day fields are restricted, either may match.
  const dayRestricted = parts[2] !== '*';
  const weekdayRestricted = parts[4] !== '*';
  return (date: Date) => {
    const dayOk = day.has(date.getDate());
    const weekdayOk = weekday.has(date.getDay());
    return (
      minute.has(date.getMinutes()) &&
      hour.has(date.getHours()) &&
      month.has(date.getMonth() + 1) &&
      (dayRestricted && weekdayRestricted ? dayOk || weekdayOk : dayOk && weekdayOk)
    );
  };
}

/** The first minute after `from` that matches, within a year. */
export function nextCron(expression: string, from = Date.now()) {
  const matches = parseCron(expression);
  const date = new Date(from);
  date.setSeconds(0, 0);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    date.setMinutes(date.getMinutes() + 1);
    if (matches(date)) return date.getTime();
  }
  throw new Error('cron 一年内没有触发时间');
}

/**
 * Scheduled wakes of every project: one-time (`send_later`), routines (cron), subscriptions to
 * external sources, which the service watches, and decision reminders. Each project keeps its
 * own file. A wake that came due while the app was closed fires once at start, marked as late.
 */
export class WakeScheduler {
  onFire: (wake: WakeSpec, late: boolean) => void = () => {};
  onChange: () => void = () => {};
  private wakes = new Map<string, WakeSpec[]>();
  private files = new Map<string, JsonFile>();
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  async load(projectId: string, path: string) {
    const file = new JsonFile(path);
    this.files.set(projectId, file);
    const raw = await readJson(path);
    this.wakes.set(projectId, raw ? fileSchema.parse(raw).wakes : []);
  }
  /** Starts the timer; due wakes fire now. */
  start() {
    this.stopped = false;
    this.tick(true);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
  all() {
    return [...this.wakes.values()].flat();
  }
  forTarget(sessionId: string) {
    return this.all().filter((w) => w.targetSessionId === sessionId);
  }
  subscriptions() {
    return this.all().filter((w) => w.kind === 'subscription');
  }
  async add(input: Omit<WakeSpec, 'id' | 'createdAt'>) {
    const list = this.wakes.get(input.projectId);
    if (!list) throw new Error('项目不存在');
    if (
      list.filter((w) => w.targetSessionId === input.targetSessionId).length >= MAX_WAKES_PER_TARGET
    )
      throw new Error(`一个会话最多保留 ${MAX_WAKES_PER_TARGET} 个定时或订阅，请先取消不需要的`);
    const wake: WakeSpec = wakeSpecSchema.parse({
      ...input,
      id: randomUUID(),
      createdAt: Date.now(),
      ...(input.kind === 'routine' && input.cron ? { fireAt: nextCron(input.cron) } : {}),
      ...(input.kind === 'subscription' && !input.expiresAt
        ? { expiresAt: Date.now() + SUBSCRIPTION_DAYS * 86_400_000 }
        : {}),
    });
    list.push(wake);
    await this.save(input.projectId);
    this.tick();
    return wake;
  }
  async cancel(id: string, targetSessionId?: string) {
    for (const [projectId, list] of this.wakes) {
      const wake = list.find((w) => w.id === id);
      if (!wake) continue;
      if (targetSessionId && wake.targetSessionId !== targetSessionId)
        throw new Error('只能取消本会话的定时或订阅');
      this.wakes.set(
        projectId,
        list.filter((w) => w.id !== id),
      );
      await this.save(projectId);
      this.tick();
      return true;
    }
    return false;
  }
  async removeTarget(sessionId: string) {
    for (const [projectId, list] of this.wakes) {
      const next = list.filter((w) => w.targetSessionId !== sessionId);
      if (next.length === list.length) continue;
      this.wakes.set(projectId, next);
      await this.save(projectId);
    }
    this.tick();
  }
  async removeProject(projectId: string) {
    this.wakes.delete(projectId);
    const file = this.files.get(projectId);
    this.files.delete(projectId);
    await file?.settled();
    this.tick();
  }
  /** Fires due wakes and arms the timer for the next one. */
  private tick(starting = false) {
    clearTimeout(this.timer);
    if (this.stopped) return;
    const now = Date.now();
    for (const [projectId, list] of this.wakes) {
      let changed = false;
      const keep: WakeSpec[] = [];
      for (const wake of list) {
        if (wake.expiresAt !== undefined && wake.expiresAt <= now) {
          changed = true;
          continue;
        }
        if (
          (wake.kind === 'once' || wake.kind === 'routine') &&
          wake.fireAt !== undefined &&
          wake.fireAt <= now
        ) {
          changed = true;
          const late = starting && now - wake.fireAt > 60_000;
          this.onFire(wake, late);
          if (wake.kind === 'routine' && wake.cron)
            keep.push({ ...wake, fireAt: nextCron(wake.cron, now) });
          continue;
        }
        keep.push(wake);
      }
      if (changed) {
        this.wakes.set(projectId, keep);
        void this.save(projectId).catch(() => {});
      }
    }
    const next = Math.min(
      ...this.all().flatMap((w) => [w.fireAt ?? Infinity, w.expiresAt ?? Infinity]),
    );
    const delay = Math.max(1000, Math.min(MAX_TIMER, next - Date.now()));
    this.timer = setTimeout(() => this.tick(), delay);
    this.timer.unref?.();
  }
  private async save(projectId: string) {
    await this.files.get(projectId)?.write({ version: 1, wakes: this.wakes.get(projectId) ?? [] });
    this.onChange();
  }
}

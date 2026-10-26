import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { SessionLog } from '../src/main/agent/kernel/event-log';
import { MemoryConflict, MemoryStore } from '../src/main/agent/kernel/memory';
import { APPROVE, DecisionStore, callHash } from '../src/main/agent/kernel/decisions';
import { WakeScheduler, nextCron, parseCron } from '../src/main/agent/kernel/wakes';
import { Mailbox } from '../src/main/agent/kernel/mailbox';
import { Scheduler } from '../src/main/agent/kernel/scheduler';
import { batchDeleteGuard, createPolicy } from '../src/main/agent/kernel/policy';
import { defineTool } from '../src/main/agent/kernel/tool';
import type { CapabilityPack } from '../src/main/agent/kernel/capability';
import { z } from 'zod';
import type { OsMessage } from '../src/shared/agent-os';

const message = (text: string, status: OsMessage['status'] = 'succeeded'): OsMessage => ({
  id: randomUUID(),
  role: 'user',
  text,
  status,
  trust: 'principal',
});

test('the session log replays upserts and wakes, skips a torn line and reports an unfinished round', async () => {
  const path = join(test.info().outputPath('log'), 's.events.jsonl');
  const log = new SessionLog(path);
  const a = message('一');
  const b = message('二');
  await log.messages([a, b]);
  await log.messages([{ ...a, text: '一（改）' }]);
  const wake = {
    id: randomUUID(),
    reason: 'user_message' as const,
    trust: 'principal' as const,
    prompt: 'p',
    priority: 1,
    at: 1,
  };
  const taken = { ...wake, id: randomUUID() };
  await log.wake(wake);
  await log.wake(taken);
  await log.taken(taken.id);
  const run = randomUUID();
  await log.roundStart(run, taken.id);
  await appendFile(path, '{"t":"msg","m":{"id":');
  const reopened = new SessionLog(path);
  const replayed = await reopened.replay();
  expect(replayed.messages.map((m) => m.text)).toEqual(['一（改）', '二']);
  expect(replayed.inbox.map((w) => w.id)).toEqual([wake.id]);
  expect(replayed.unfinished).toMatchObject({
    runId: run,
    wakeId: taken.id,
    wake: { id: taken.id },
  });
  await reopened.roundEnd(run, 'succeeded');
  expect((await new SessionLog(path).replay()).unfinished).toBeNull();
});

test('memory checks versions, refuses secrets and keeps an index of topic headers', async () => {
  const memory = new MemoryStore(test.info().outputPath('memory'));
  const first = await memory.write(
    'writing-style',
    { description: '写作偏好', type: 'preference', body: '先给结论' },
    null,
  );
  await expect(
    memory.write(
      'writing-style',
      { description: '写作偏好', type: 'preference', body: '重复新建' },
      null,
    ),
  ).rejects.toBeInstanceOf(MemoryConflict);
  const second = await memory.write(
    'writing-style',
    { description: '写作偏好（更新）', type: 'preference', body: '先给结论，再列依据' },
    first.version,
  );
  await expect(
    memory.write(
      'writing-style',
      { description: 'x', type: 'preference', body: '旧版本' },
      first.version,
    ),
  ).rejects.toBeInstanceOf(MemoryConflict);
  await expect(
    memory.write(
      'keys',
      { description: 'k', type: 'fact', body: 'sk-abcdefghijklmnopqrstuv' },
      null,
    ),
  ).rejects.toThrow('密钥');
  await expect(
    memory.write('Bad Name', { description: 'x', type: 'fact', body: 'x' }, null),
  ).rejects.toThrow();
  await expect(
    memory.write('long', { description: 'x', type: 'fact', body: 'x'.repeat(5000) }, null),
  ).rejects.toThrow('4096');
  const index = await memory.index();
  expect(index).toContain('writing-style（preference');
  expect(index).toContain('写作偏好（更新）');
  expect((await memory.read('writing-style'))?.body.trim()).toBe('先给结论，再列依据');
  await memory.remove('writing-style', second.version);
  expect(await memory.list()).toEqual([]);
  expect(await readFile(join(memory.dir, 'MEMORY.md'), 'utf8')).not.toContain('writing-style');
});

test('a decision approves one exact call once, and only an answer can approve', async () => {
  const projectId = randomUUID();
  const thread = randomUUID();
  const decisions = new DecisionStore(
    join(test.info().outputPath('d'), 'decisions.json'),
    projectId,
  );
  await decisions.initialize();
  const hash = callHash('delete_file', { path: 'a.txt', folderId: 'f' });
  expect(callHash('delete_file', { folderId: 'f', path: 'a.txt' })).toBe(hash);
  const card = await decisions.create({
    threadId: thread,
    question: '删除 a.txt？',
    options: [
      { label: '批准执行', consequence: '删除' },
      { label: '不执行', consequence: '跳过' },
    ],
    recommended: 0,
    irreversible: true,
    tool: { name: 'delete_file', inputHash: hash, detail: 'a.txt' },
  });
  expect(decisions.pendingCall(thread, 'delete_file', hash)?.id).toBe(card.id);
  expect(await decisions.consumeGrant(thread, 'delete_file', hash)).toBe(false);
  await decisions.answer(card.id, APPROVE);
  await expect(decisions.answer(card.id, APPROVE)).rejects.toThrow('已处理');
  expect(await decisions.consumeGrant(randomUUID(), 'delete_file', hash)).toBe(false);
  expect(
    await decisions.consumeGrant(thread, 'delete_file', callHash('delete_file', { path: 'b.txt' })),
  ).toBe(false);
  expect(await decisions.consumeGrant(thread, 'delete_file', hash)).toBe(true);
  expect(await decisions.consumeGrant(thread, 'delete_file', hash)).toBe(false);
  const reloaded = new DecisionStore(
    join(test.info().outputPath('d'), 'decisions.json'),
    projectId,
  );
  await reloaded.initialize();
  expect(reloaded.get(card.id)?.consumedAt).toBeTruthy();
  const later = await decisions.create({
    threadId: thread,
    question: '写给谁？',
    options: [
      { label: '投资人', consequence: 'a' },
      { label: '团队', consequence: 'b' },
    ],
    recommended: 1,
    irreversible: false,
  });
  expect(await decisions.dueReminders(Date.now())).toEqual([]);
  const due = await decisions.dueReminders(Date.now() + 3 * 60 * 60_000);
  expect(due.map((d) => d.id)).toEqual([later.id]);
  expect(await decisions.dueReminders(Date.now() + 9 * 60 * 60_000)).toEqual([]);
});

test('cron finds the next minute, and wakes fire once, repeat by routine or fire late at start', async () => {
  expect(() => parseCron('* * *')).toThrow();
  expect(() => parseCron('61 * * * *')).toThrow();
  const from = new Date(2026, 9, 26, 8, 30).getTime();
  expect(new Date(nextCron('0 9 * * *', from)).getHours()).toBe(9);
  expect(new Date(nextCron('*/15 * * * *', from)).getMinutes()).toBe(45);
  const monday = new Date(nextCron('0 9 * * 1', from));
  expect(monday.getDay()).toBe(1);
  const root = test.info().outputPath('wakes');
  const projectId = randomUUID();
  const target = randomUUID();
  const scheduler = new WakeScheduler();
  const fired: { note: string; late: boolean }[] = [];
  scheduler.onFire = (wake, late) => fired.push({ note: wake.note, late });
  await scheduler.load(projectId, join(root, 'w.json'));
  // Not started: nothing fires until the app starts the timer.
  scheduler.stop();
  await scheduler.add({
    projectId,
    targetSessionId: target,
    kind: 'once',
    fireAt: Date.now() - 5 * 60_000,
    note: '过期',
  });
  const routine = await scheduler.add({
    projectId,
    targetSessionId: target,
    kind: 'routine',
    cron: '0 9 * * *',
    note: '每天',
  });
  expect(routine.fireAt).toBeGreaterThan(Date.now());
  const restarted = new WakeScheduler();
  restarted.onFire = (wake, late) => fired.push({ note: wake.note, late });
  await restarted.load(projectId, join(root, 'w.json'));
  restarted.start();
  restarted.stop();
  expect(fired).toContainEqual({ note: '过期', late: true });
  expect(restarted.forTarget(target).map((w) => w.note)).toEqual(['每天']);
  await expect(restarted.cancel(routine.id, randomUUID())).rejects.toThrow('本会话');
  expect(await restarted.cancel(routine.id, target)).toBe(true);
  expect(restarted.forTarget(target)).toEqual([]);
});

test('the mailbox limits size, bursts and repeats between two Agents', () => {
  const mailbox = new Mailbox();
  const [a, b] = [randomUUID(), randomUUID()];
  expect(() => mailbox.check(a, a, 'x')).toThrow('自己');
  expect(() => mailbox.check(a, b, 'x'.repeat(9000))).toThrow('8000');
  mailbox.check(a, b, '你好');
  expect(() => mailbox.check(a, b, '你好')).toThrow('相同内容');
  for (let i = 0; i < 5; i++) mailbox.check(a, b, `第 ${i} 条`);
  expect(() => mailbox.check(a, b, '再一条')).toThrow('过多');
  mailbox.check(b, a, '回复');
});

test('slots go to the session the user looks at first, then by priority and arrival', async () => {
  const scheduler = new Scheduler(1);
  const order: string[] = [];
  const first = await scheduler.acquire('busy');
  let viewing = false;
  const take = (key: string, priority: () => 0 | 1 | 2 | 3) =>
    scheduler.acquire(key, undefined, priority).then((release) => {
      order.push(key);
      release();
    });
  const waits = [
    take('background', () => 3),
    take('scheduled', () => 2),
    take('opened', () => (viewing ? 0 : 3)),
  ];
  viewing = true;
  first();
  await Promise.all(waits);
  expect(order).toEqual(['opened', 'scheduled', 'background']);
});

test('the policy runs hooks, deny, mode and mounts before risk, and asks only through confirm', async () => {
  const noop = z.object({ path: z.string().optional() }).strict();
  const pack = (
    id: string,
    tools: [string, 'read' | 'reversible' | 'confirm' | 'forbidden'][],
  ): CapabilityPack => ({
    id,
    prompt: '',
    tools: tools.map(([name, risk]) => defineTool(name, name, risk, noop, () => ({}))),
  });
  const packs = [
    pack('files', [
      ['read_file', 'read'],
      ['create_file', 'reversible'],
      ['delete_file', 'confirm'],
    ]),
    pack('kernel', [['format_disk', 'forbidden']]),
  ];
  const confirmed: string[] = [];
  let mounted = false;
  const policy = createPolicy(packs, {
    rules: { deny: ['blocked_*'], ask: ['create_file'], allow: [] },
    gated: new Set(['files']),
    mounted: () => mounted,
    hooks: [batchDeleteGuard],
    confirm: async ({ tool }) => {
      confirmed.push(tool.name);
      return { block: true, reason: 'card' };
    },
  });
  expect(await policy.decide('unknown', {})).toMatchObject({ block: true });
  expect(await policy.decide('format_disk', {})).toMatchObject({
    block: true,
    reason: expect.stringContaining('禁止'),
  });
  expect(await policy.decide('read_file', {})).toBeUndefined();
  expect(await policy.decide('delete_file', { path: '*.md' })).toMatchObject({
    reason: expect.stringContaining('批量删除'),
  });
  expect(await policy.decide('create_file', { path: 'a' })).toMatchObject({
    reason: expect.stringContaining('request_capability'),
  });
  mounted = true;
  // `ask` makes a reversible tool wait for the user like an irreversible one.
  expect(await policy.decide('create_file', { path: 'a' })).toMatchObject({ reason: 'card' });
  expect(await policy.decide('delete_file', { path: 'a.txt' })).toMatchObject({ reason: 'card' });
  expect(confirmed).toEqual(['create_file', 'delete_file']);
  const plan = createPolicy(packs, { mode: 'plan', confirm: async () => undefined });
  expect(await plan.decide('read_file', {})).toBeUndefined();
  expect(await plan.decide('create_file', {})).toMatchObject({
    reason: expect.stringContaining('计划模式'),
  });
  const coordinator = createPolicy(packs, {});
  expect(await coordinator.decide('delete_file', { path: 'a' })).toMatchObject({
    reason: expect.stringContaining('线程'),
  });
  const limited = createPolicy(packs, { maxCalls: 1 });
  await limited.decide('read_file', {});
  expect(await limited.decide('read_file', {})).toMatchObject({
    reason: expect.stringContaining('上限'),
  });
});

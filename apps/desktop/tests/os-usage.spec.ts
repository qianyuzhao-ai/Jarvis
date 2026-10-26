import { randomUUID } from 'node:crypto';
import { appendFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { UsageLedger, type UsageEntry } from '../src/main/agent/kernel/usage';
import { call, mockModel, promptOf, startOs, type MockReply } from './helpers/os';

const day = 24 * 3600_000;
const now = new Date(2026, 9, 26, 15, 0).getTime();
const projectA = randomUUID();
const projectB = randomUUID();
const threadA = randomUUID();
const threadB = randomUUID();
const entry = (patch: Partial<UsageEntry>): UsageEntry => ({
  at: now,
  role: 'coordinator',
  projectId: projectA,
  sessionId: randomUUID(),
  provider: 'DeepSeek',
  model: 'DeepSeek V4.1 Flash',
  input: 80,
  output: 10,
  cacheRead: 10,
  cacheWrite: 0,
  tokens: 100,
  cost: 0.01,
  ...patch,
});
const names = {
  project: (id: string) => ({ [projectA]: '周报与日程', [projectB]: '品牌升级' })[id],
  thread: (id: string) => (id === threadA ? { title: '整理周报', projectId: projectA } : undefined),
};

test('the usage ledger splits by month, skips torn lines and sums the main agent, threads and others', async () => {
  const dir = test.info().outputPath('usage');
  const ledger = new UsageLedger(dir);
  await ledger.record(entry({}));
  await ledger.record(entry({ role: 'thread', sessionId: threadA, tokens: 300, cost: 0.02 }));
  await ledger.record(
    entry({
      role: 'thread',
      projectId: projectB,
      sessionId: threadB,
      provider: '星河中转',
      model: 'gpt-5.2',
      tokens: 500,
      cost: null,
    }),
  );
  await ledger.record(
    entry({ role: 'other', projectId: undefined, sessionId: undefined, tokens: 7 }),
  );
  // Three days ago, and two months ago in another file.
  await ledger.record(entry({ at: now - 3 * day, tokens: 40 }));
  await ledger.record(entry({ at: new Date(2026, 7, 10).getTime(), tokens: 1000 }));
  // A crash mid-write leaves a torn line; the next record still parses.
  await appendFile(join(dir, '2026-10.jsonl'), '\n{"at":1,"role":');
  await ledger.record(entry({ tokens: 2 }));
  expect((await readdir(dir)).sort()).toEqual(['2026-08.jsonl', '2026-10.jsonl']);

  const today = await ledger.summary({ range: 'today', projectId: null }, names, now);
  expect(today.total).toEqual({ tokens: 909, cost: expect.closeTo(0.05, 5), unpricedModels: 1 });
  expect(today.coordinator).toEqual({ tokens: 102, cost: expect.closeTo(0.02, 5) });
  expect(today.thread).toEqual({ tokens: 800, cost: 0.02 });
  expect(today.other).toEqual({ tokens: 7, cost: expect.closeTo(0.01, 5) });
  expect(today.buckets).toHaveLength(1);
  expect(today.buckets[0]).toMatchObject({ coordinator: 102, thread: 800, other: 7 });
  expect(today.models.map((m) => [m.model, m.tokens, m.cost])).toEqual([
    ['gpt-5.2', 500, null],
    ['DeepSeek V4.1 Flash', 409, expect.closeTo(0.05, 5)],
  ]);
  expect(today.models[1]).toMatchObject({ input: 320, output: 40, cache: 40 });
  expect(today.projects.map((p) => [p.title, p.tokens])).toEqual([['周报与日程', 102]]);
  expect(today.threads.map((t) => [t.title, t.projectTitle, t.tokens, t.cost])).toEqual([
    ['已删除的线程', '品牌升级', 500, null],
    ['整理周报', '周报与日程', 300, 0.02],
  ]);

  const week = await ledger.summary({ range: '7d', projectId: null }, names, now);
  expect(week.total.tokens).toBe(949);
  expect(week.buckets.map((b) => b.coordinator)).toEqual([0, 0, 0, 40, 0, 0, 102]);
  expect(week.since).toBe(new Date(2026, 7, 10).getTime());

  // One project: its Coordinator and threads, never model tests.
  const one = await ledger.summary({ range: '30d', projectId: projectA }, names, now);
  expect([one.coordinator.tokens, one.thread.tokens, one.other.tokens]).toEqual([142, 300, 0]);

  // "All" spans more than a month, so it is drawn by month.
  const all = await ledger.summary({ range: 'all', projectId: null }, names, now);
  expect(all.total.tokens).toBe(1949);
  expect(all.buckets.map((b) => [b.unit, b.coordinator])).toEqual([
    ['month', 1000],
    ['month', 0],
    ['month', 142],
  ]);
});

test('an empty ledger summarizes to zero', async () => {
  const ledger = new UsageLedger(test.info().outputPath('none'));
  const summary = await ledger.summary({ range: 'all', projectId: null }, names, now);
  expect(summary).toMatchObject({
    since: null,
    total: { tokens: 0, cost: null, unpricedModels: 0 },
  });
  expect(summary.buckets).toHaveLength(1);
});

test('Agent OS records the Coordinator and its threads separately, with no price for a relay', async () => {
  const server = await mockModel((body, step): MockReply => {
    if (promptOf(body).system.includes('协调者（Coordinator）')) {
      if (promptOf(body).user.includes('线程状态通知')) return { text: '好了。' };
      if (step === 0)
        return call('spawn_thread', {
          title: '整理本周周报',
          objective: '整理一份本周周报',
          outputFormat: '一段摘要',
          effortHint: 'quick',
        });
      return { text: '已交给线程。' };
    }
    if (step === 0)
      return call('report_result', { status: 'done', summary: '写好了。', resolved: true });
    return { text: '写好了。' };
  });
  const { os, coordinator, project, idle } = await startOs(
    test.info().outputPath('agent'),
    server.url,
  );
  try {
    await os.send(coordinator, '帮我整理本周周报');
    await idle();
    await expect
      .poll(async () => (await os.usageSummary({ range: 'today', projectId: null })).thread.tokens)
      .toBeGreaterThan(0);
    const summary = await os.usageSummary({ range: 'today', projectId: project.id });
    const replies = (role: string) =>
      server.bodies.filter(
        (b) => promptOf(b).system.includes('协调者（Coordinator）') === (role === 'coordinator'),
      ).length;
    // The mock reports 100 input and 20 output tokens per request.
    expect(summary.coordinator).toEqual({ tokens: replies('coordinator') * 120, cost: null });
    expect(summary.thread).toEqual({ tokens: replies('thread') * 120, cost: null });
    expect(summary.total.unpricedModels).toBe(1);
    expect(summary.models).toEqual([
      expect.objectContaining({ provider: 'Relay', input: server.bodies.length * 100 }),
    ]);
    expect(summary.projects).toEqual([
      expect.objectContaining({ projectId: project.id, title: project.project.title }),
    ]);
    expect(summary.threads).toEqual([
      expect.objectContaining({ title: '整理本周周报', projectId: project.id }),
    ]);
  } finally {
    await os.shutdown();
    await server.close();
  }
});

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import { groupByDay } from '../src/renderer/src/features/shell/conversation-groups';

test('home conversations group by local day, newest first, without empty groups', () => {
  const now = new Date(2026, 9, 25, 15, 0).getTime();
  const at = (days: number, hour = 9) => new Date(2026, 9, 25 - days, hour).getTime();
  const items = [
    { id: 'old', updatedAt: at(30) },
    { id: 'week', updatedAt: at(3) },
    { id: 'yesterday-late', updatedAt: at(1, 23) },
    { id: 'today-early', updatedAt: at(0, 0) },
    { id: 'today', updatedAt: at(0, 14) },
  ];
  expect(groupByDay(items, now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
    ['今天', ['today', 'today-early']],
    ['昨天', ['yesterday-late']],
    ['最近 7 天', ['week']],
    ['更早', ['old']],
  ]);
  expect(groupByDay([{ id: 'x', updatedAt: at(0) }], now).map((g) => g.label)).toEqual(['今天']);
});

test('the current segment is the home conversation that last received a user message', async () => {
  const server = createServer(async (req, res) => {
    for await (const _part of req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(chunk({ content: '好' }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const root = test.info().outputPath('agent');
  await mkdir(root, { recursive: true });
  // One home conversation from before segments existed.
  const legacy = randomUUID();
  await writeFile(
    join(root, 'index.json'),
    JSON.stringify({
      version: 1,
      sessions: [
        {
          view: {
            id: legacy,
            title: '旧对话',
            model: 'mock',
            createdAt: 1,
            updatedAt: 2,
            runId: null,
            contextTokens: null,
            contextWindow: null,
            messages: [{ id: randomUUID(), role: 'user', text: '旧问题', status: 'succeeded' }],
          },
        },
      ],
      requests: [],
    }),
  );
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const models = new ModelStore(new JsonFile(join(root, 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  await store.initialize();
  const service = new AgentService(models, store, root);
  const idle = async () =>
    expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);
  try {
    expect(store.record(legacy).view.agent.kind).toBe('main');
    expect(service.snapshot().snapshot.currentSegmentId).toBe(legacy);
    const provider = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    await models.setProviderModels(provider, [{ modelId: 'mock' }]);
    const a = await service.create();
    const b = await service.create();
    const canvas = await service.create(randomUUID());
    // A new, empty segment does not take over before it has a message.
    expect(service.currentSegment()).toBe(legacy);
    await service.send(a, randomUUID(), '在 A 提问', 1);
    await idle();
    expect(service.currentSegment()).toBe(a);
    await new Promise((r) => setTimeout(r, 5));
    await service.send(b, randomUUID(), '在 B 提问', 1);
    await idle();
    expect(service.currentSegment()).toBe(b);
    expect(store.record(canvas).view.agent.kind).toBe('canvas');
    await new Promise((r) => setTimeout(r, 5));
    await service.send(a, randomUUID(), '回到 A', 1);
    await idle();
    expect(service.snapshot().snapshot.currentSegmentId).toBe(a);
    await service.deleteSession(a);
    expect(service.currentSegment()).toBe(b);
  } finally {
    await service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

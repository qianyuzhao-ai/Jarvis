import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { Scheduler } from '../src/main/agent/kernel/scheduler';
import { ModelStore } from '../src/main/agent/model-store';
import { openAgent } from '../src/main/agent/runtime';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import { AgentSettingsStore } from '../src/main/agent/settings';
import { writeFile } from 'node:fs/promises';
import { relayModel } from './helpers/models';

const chunk = (delta: unknown, finish: string | null = null, usage?: unknown) =>
  `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;

/** A relay whose replies wait until the test releases them, one per request in arrival order. */
async function heldRelay() {
  const held: ((text: string) => void)[] = [];
  const server = createServer(async (req, res) => {
    for await (const _chunk of req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': open\n\n');
    held.push((text) => res.end(chunk({ content: text }) + chunk({}, 'stop') + 'data: [DONE]\n\n'));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  return { held, server, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

async function serviceWith(baseUrl: string) {
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const root = test.info().outputPath('agent');
  const models = new ModelStore(new JsonFile(join(root, 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  const service = new AgentService(models, store, root);
  const provider = await models.saveProvider({
    kind: 'custom',
    name: 'Relay',
    baseUrl,
    api: 'openai-completions',
    apiKey: '',
    clearKey: false,
  });
  await models.setProviderModels(provider, [{ modelId: 'mock' }]);
  return { service, store };
}

test('scheduler serves slots first come first served and stops waiting on abort', async () => {
  const scheduler = new Scheduler(1);
  const first = await scheduler.acquire('a');
  const order: string[] = [];
  const second = scheduler.acquire('b').then((release) => {
    order.push('b');
    return release;
  });
  const controller = new AbortController();
  const aborted = scheduler.acquire('c', controller.signal);
  const third = scheduler.acquire('d').then((release) => {
    order.push('d');
    return release;
  });
  expect([...scheduler.waiting()]).toEqual(['b', 'c', 'd']);
  controller.abort();
  await expect(aborted).rejects.toThrow('已停止');
  expect([...scheduler.waiting()]).toEqual(['b', 'd']);
  first();
  first();
  (await second)();
  (await third)();
  expect(order).toEqual(['b', 'd']);
  // Raising the limit grants waiting requests at once.
  const x = await scheduler.acquire('x');
  const y = scheduler.acquire('y');
  expect([...scheduler.waiting()]).toEqual(['y']);
  scheduler.setLimit(2);
  const releaseY = await y;
  expect(scheduler.waiting().size).toBe(0);
  x();
  releaseY();
});

test('conversations reply at the same time up to the limit, and the rest wait for a slot', async () => {
  const relay = await heldRelay();
  const { service, store } = await serviceWith(relay.baseUrl);
  try {
    service.scheduler.setLimit(1);
    const a = await service.create();
    const b = await service.create();
    await service.send(a, randomUUID(), '甲', 1);
    await service.send(b, randomUUID(), '乙', 1);
    await expect.poll(() => relay.held.length).toBe(1);
    // B's round has started but its model request waits for the slot A holds.
    await expect
      .poll(() => service.snapshot().snapshot.runs)
      .toEqual({ [a]: 'running', [b]: 'waiting' });
    await new Promise((r) => setTimeout(r, 200));
    expect(relay.held).toHaveLength(1);
    // Other conversations stay editable while these two reply.
    const c = await service.create();
    await service.setThinkingLevel(c, 'off');
    await expect(service.setThinkingLevel(a, 'off')).rejects.toThrow('这个对话');
    relay.held.shift()?.('甲的回复');
    await expect.poll(() => relay.held.length).toBe(1);
    expect(service.snapshot().snapshot.runs).toEqual({ [b]: 'running' });
    relay.held.shift()?.('乙的回复');
    await expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);
    expect(store.record(a).view.messages.at(-1)).toMatchObject({
      text: '甲的回复',
      status: 'succeeded',
    });
    expect(store.record(b).view.messages.at(-1)).toMatchObject({
      text: '乙的回复',
      status: 'succeeded',
    });

    service.scheduler.setLimit(2);
    await service.send(a, randomUUID(), '再问甲', 1);
    await service.send(b, randomUUID(), '再问乙', 1);
    await expect.poll(() => relay.held.length).toBe(2);
    expect(service.snapshot().snapshot.runs).toEqual({ [a]: 'running', [b]: 'running' });
    for (const release of relay.held.splice(0)) release('好');
    await expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);
  } finally {
    await service.shutdown();
    relay.server.closeAllConnections();
    await new Promise<void>((r) => relay.server.close(() => r()));
  }
});

test('messages sent while replying queue in order, and stopping drops the queue', async () => {
  const relay = await heldRelay();
  const { service, store } = await serviceWith(relay.baseUrl);
  try {
    const id = await service.create();
    await service.send(id, randomUUID(), '第一问', 1);
    await expect.poll(() => relay.held.length).toBe(1);
    await service.send(id, randomUUID(), '第二问', 1);
    await service.send(id, randomUUID(), '第三问', 1);
    const statuses = () =>
      store.record(id).view.messages.map((m) => `${m.role}:${m.text || '…'}:${m.status}`);
    expect(statuses()).toEqual([
      'user:第一问:succeeded',
      'assistant:…:running',
      'user:第二问:queued',
      'user:第三问:queued',
    ]);
    relay.held.shift()?.('第一答');
    await expect.poll(() => relay.held.length).toBe(1);
    expect(statuses()).toEqual([
      'user:第一问:succeeded',
      'assistant:第一答:succeeded',
      'user:第二问:succeeded',
      'assistant:…:running',
      'user:第三问:queued',
    ]);
    const runId = store.record(id).view.runId;
    if (!runId) throw new Error('Missing run');
    await service.cancel(runId, 1);
    expect(statuses()).toEqual([
      'user:第一问:succeeded',
      'assistant:第一答:succeeded',
      'user:第二问:succeeded',
      'assistant:…:cancelled',
      'user:第三问:cancelled',
    ]);
    expect(relay.held).toHaveLength(1);
    expect(service.snapshot().snapshot.runs).toEqual({});

    // A queued message left over from a previous launch is not sent after a restart.
    await service.send(id, randomUUID(), '第四问', 1);
    await expect.poll(() => relay.held.length).toBe(2);
    await service.send(id, randomUUID(), '第五问', 1);
    await store.saveView(id);
    const restarted = new AgentStore(
      new JsonFile(join(test.info().outputPath('agent'), 'index.json')),
    );
    await restarted.initialize();
    expect(restarted.record(id).view.messages.at(-1)).toMatchObject({
      text: '第五问',
      status: 'cancelled',
      error: expect.stringContaining('没有发送'),
    });
  } finally {
    for (const release of relay.held.splice(0)) release('');
    await service.shutdown();
    relay.server.closeAllConnections();
    await new Promise<void>((r) => relay.server.close(() => r()));
  }
});

test('compaction summarizes long history without using up the round request limit', async () => {
  const bodies: { messages: { role: string; content: unknown }[] }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const summary = JSON.stringify(body.messages[0]).includes('context summarization assistant');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const usage = { prompt_tokens: 38_000, completion_tokens: 1_000, total_tokens: 39_000 };
    const text = summary
      ? '## 摘要\n用户问了很多问题。'
      : bodies.length === 1
        ? '长回复'.repeat(30_000)
        : '压缩后的回复';
    res.end(chunk({ content: text }) + chunk({}, 'stop', usage) + 'data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const model = relayModel({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'mock',
    contextWindow: 40_000,
  });
  const root = test.info().outputPath('runtime'),
    id = randomUUID();
  try {
    const events: string[] = [];
    for (const prompt of ['第一问', '第二问']) {
      // Each round opens a fresh session on the same history, like the service does.
      const { session } = await openAgent(root, id, model);
      session.subscribe((e) => {
        if (e.type === 'compaction_end') events.push(e.result ? 'compacted' : 'failed');
      });
      try {
        await session.prompt(prompt, { expandPromptTemplates: false });
        expect(session.messages.filter((m) => m.role === 'assistant').at(-1)?.stopReason).toBe(
          'stop',
        );
      } finally {
        session.dispose();
      }
    }
    expect(events).toContain('compacted');
    const kinds = bodies.map((b) =>
      JSON.stringify(b.messages[0]).includes('context summarization assistant')
        ? 'summary'
        : 'reply',
    );
    expect(kinds.filter((k) => k === 'summary')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'reply')).toHaveLength(2);
    expect(JSON.stringify(bodies.at(-1))).toContain('用户问了很多问题');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('the concurrency setting persists, rejects out-of-range values and applies to waiting rounds', async () => {
  const relay = await heldRelay();
  const { service } = await serviceWith(relay.baseUrl);
  const root = test.info().outputPath('agent');
  try {
    await service.loadSettings();
    expect(service.settings.get().concurrency).toBe(3);
    await expect(service.setConcurrency(0)).rejects.toThrow();
    await expect(service.setConcurrency(7)).rejects.toThrow();
    await service.setConcurrency(1);
    const a = await service.create();
    const b = await service.create();
    await service.send(a, randomUUID(), '甲', 1);
    await service.send(b, randomUUID(), '乙', 1);
    await expect.poll(() => service.snapshot().snapshot.runs[b]).toBe('waiting');
    // Raising the limit lets the waiting round start without stopping the first one.
    await service.setConcurrency(2);
    await expect.poll(() => relay.held.length).toBe(2);
    expect(service.snapshot().snapshot.runs).toEqual({ [a]: 'running', [b]: 'running' });
    for (const release of relay.held.splice(0)) release('好');
    await expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);

    const restarted = new AgentSettingsStore(new JsonFile(join(root, 'settings.json')));
    await restarted.initialize();
    expect(restarted.get().concurrency).toBe(2);
    await writeFile(join(root, 'settings.json'), '{"version":1,"concurrency":99}');
    const invalid = new AgentSettingsStore(new JsonFile(join(root, 'settings.json')));
    await invalid.initialize();
    expect(invalid.get().concurrency).toBe(3);
  } finally {
    for (const release of relay.held.splice(0)) release('');
    await service.shutdown();
    relay.server.closeAllConnections();
    await new Promise<void>((r) => relay.server.close(() => r()));
  }
});

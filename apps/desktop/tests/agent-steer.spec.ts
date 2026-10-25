import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentSettingsStore } from '../src/main/agent/settings';
import { AgentStore } from '../src/main/agent/store';
import type { SessionEvent } from '../src/shared/agent';

type Body = { messages: { role: string; content: unknown }[] };

test('a message sent mid-reply steers it by default; in queue mode it waits and can be steered once', async () => {
  const bodies: Body[] = [];
  const holds: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const last = JSON.stringify(body.messages.at(-1));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const end = (content: string) =>
      res.end(chunk({ content }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
    if (last.includes('慢问题')) {
      // Part of an answer, then hold until released.
      res.write(chunk({ content: '先回答一部分' }));
      holds.push(() => end('。'));
      return;
    }
    if (last.includes('换个方向') || last.includes('补充')) return end('按新方向回答');
    end('另一个回答');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const root = test.info().outputPath('agent');
  const models = new ModelStore(new JsonFile(join(root, 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  const service = new AgentService(models, store, root);
  await service.loadSettings();
  const events: SessionEvent[] = [];
  service.onSessionChange = (e) => events.push(e);
  const idle = () =>
    expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);
  const transcript = (id: string) =>
    store
      .record(id)
      .view.messages.map((m) => ({ role: m.role, text: m.text, status: m.status, steer: m.steer }));
  try {
    const provider = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    await models.setProviderModels(provider, [{ modelId: 'mock' }]);
    expect(service.settings.get().whileReplying).toBe('steer');

    // Steer (default): the reply takes the message in at its next step.
    const session = await service.create();
    await service.send(session, randomUUID(), '慢问题', 1);
    await expect.poll(() => store.record(session).view.messages.at(-1)?.text).toBe('先回答一部分');
    const runId = service.snapshot().snapshot.sessions.find((s) => s.id === session)?.runId;
    expect(await service.send(session, randomUUID(), '换个方向', 1)).toBe(runId);
    expect(store.record(session).view.messages.at(-1)).toMatchObject({
      text: '换个方向',
      status: 'queued',
      steer: true,
    });
    holds.shift()?.();
    await idle();
    expect(transcript(session)).toEqual([
      { role: 'user', text: '慢问题', status: 'succeeded', steer: undefined },
      { role: 'assistant', text: '先回答一部分。', status: 'succeeded', steer: undefined },
      { role: 'user', text: '换个方向', status: 'succeeded', steer: true },
      { role: 'assistant', text: '按新方向回答', status: 'succeeded', steer: undefined },
    ]);
    // One round, two model calls; the second sees the partial answer and the steering message.
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1]?.messages)).toContain('先回答一部分');
    expect(JSON.stringify(bodies[1]?.messages.at(-1))).toContain('换个方向');
    const moved = events.find((e) => e.sessionId === session && e.order);
    expect(moved?.order).toEqual(store.record(session).view.messages.map((m) => m.id));

    // Queue: the message waits; the user can still steer it once by hand.
    await service.setReplyMode('queue');
    const other = await service.create();
    await service.send(other, randomUUID(), '慢问题', 1);
    await expect.poll(() => store.record(other).view.messages.at(-1)?.text).toBe('先回答一部分');
    await service.send(other, randomUUID(), '补充', 1);
    await service.send(other, randomUUID(), '下一个问题', 1);
    const queued = store.record(other).view.messages.filter((m) => m.status === 'queued');
    expect(queued.map((m) => [m.text, m.steer])).toEqual([
      ['补充', undefined],
      ['下一个问题', undefined],
    ]);
    await service.steer(other, queued[0]?.id ?? '');
    await expect(service.steer(other, queued[0]?.id ?? '')).rejects.toThrow('不在排队中');
    expect(store.record(other).view.messages.find((m) => m.text === '补充')).toMatchObject({
      status: 'queued',
      steer: true,
    });
    holds.shift()?.();
    await idle();
    expect(transcript(other).map((m) => [m.role, m.text, m.steer ?? false])).toEqual([
      ['user', '慢问题', false],
      ['assistant', '先回答一部分。', false],
      ['user', '补充', true],
      ['assistant', '按新方向回答', false],
      ['user', '下一个问题', false],
      ['assistant', '另一个回答', false],
    ]);
    await expect(service.steer(other, randomUUID())).rejects.toThrow('没有可以引导的回复');

    // The choice persists; files written before the option existed read as steer.
    const reread = new AgentSettingsStore(new JsonFile(join(root, 'settings.json')));
    await reread.initialize();
    expect(reread.get().whileReplying).toBe('queue');
    const legacy = join(root, 'legacy-settings.json');
    await writeFile(legacy, JSON.stringify({ version: 1, concurrency: 2 }));
    const old = new AgentSettingsStore(new JsonFile(legacy));
    await old.initialize();
    expect(old.get()).toEqual({ version: 1, concurrency: 2, whileReplying: 'steer' });
  } finally {
    for (const release of holds) release();
    await service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

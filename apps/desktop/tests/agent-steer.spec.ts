import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import { AgentSettingsStore } from '../src/main/agent/settings';
import type { OsSessionEvent } from '../src/shared/agent-os';
import { startOs } from './helpers/os';

type Body = { messages: { role: string; content: unknown }[] };

test('a message sent mid-reply steers it by default; in queue mode it waits and can be steered once', async () => {
  const bodies: Body[] = [];
  const holds: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const content = JSON.stringify(body.messages.at(-1));
    // The Coordinator's prompt starts with recent conversation; only the wake itself counts.
    const last = content.slice(Math.max(0, content.lastIndexOf('[唤醒')));
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
  const root = test.info().outputPath('agent');
  const { os, coordinator: session } = await startOs(root, `http://127.0.0.1:${address.port}/v1`);
  const events: OsSessionEvent[] = [];
  os.onSessionChange = (e) => events.push(e);
  const idle = () => expect.poll(() => os.settledDown).toBe(true);
  const messages = (id: string) => os.session(id).session.messages;
  const transcript = (id: string) =>
    messages(id).map((m) => ({ role: m.role, text: m.text, status: m.status, steer: m.steer }));
  try {
    expect(os.settings.get().whileReplying).toBe('steer');

    // Steer (default): the reply takes the message in at its next step.
    await os.send(session, '慢问题');
    await expect.poll(() => messages(session).at(-1)?.text).toBe('先回答一部分');
    await os.send(session, '换个方向');
    expect(messages(session).at(-1)).toMatchObject({
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
    expect(moved?.order).toEqual(messages(session).map((m) => m.id));

    // Queue: the message waits; the user can still steer it once by hand.
    await os.setReplyMode('queue');
    const other = os.registry.get(await os.createProject('另一个项目')).project.coordinatorId;
    await os.send(other, '慢问题');
    await expect.poll(() => messages(other).at(-1)?.text).toBe('先回答一部分');
    await os.send(other, '补充');
    await os.send(other, '下一个问题');
    const queued = messages(other).filter((m) => m.status === 'queued');
    expect(queued.map((m) => [m.text, m.steer])).toEqual([
      ['补充', undefined],
      ['下一个问题', undefined],
    ]);
    await os.steer(other, queued[0]?.id ?? '');
    await expect(os.steer(other, queued[0]?.id ?? '')).rejects.toThrow('不在排队中');
    expect(messages(other).find((m) => m.text === '补充')).toMatchObject({
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
    await expect(os.steer(other, crypto.randomUUID())).rejects.toThrow('没有可以引导的回复');

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
    await os.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

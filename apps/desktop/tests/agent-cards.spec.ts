import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import type { BusEvent } from '../src/main/agent/kernel/bus';
import { canvasSnapshot } from '../src/renderer/src/features/creation/canvas-context';
import { createProject } from '../src/renderer/src/features/creation/types';

type Body = {
  messages: { role: string; content: unknown }[];
  tools?: { function: { name: string } }[];
};

test('space conversations get result cards that the next main-Agent segment opens with', async () => {
  const bodies: Body[] = [];
  let release: (() => void) | undefined;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: Body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const last = JSON.stringify(body.messages.at(-1));
    const answered = body.messages.some((m) => m.role === 'tool');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const text = (content: string) =>
      res.end(chunk({ content }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
    if (last.includes('慢慢整理')) {
      res.write(': open\n\n');
      release = () => text('画布已整理完毕');
    } else if (last.includes('需要确认') && !last.includes('未完成的空间任务卡片') && !answered) {
      res.end(
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'r1',
              type: 'function',
              function: {
                name: 'report_result',
                arguments: JSON.stringify({
                  status: 'needs_user',
                  summary: '分镜已排好，风格待定',
                  artifacts: [{ kind: 'node', ref: 'n1' }],
                  openQuestions: ['用写实还是插画？'],
                }),
              },
            },
          ],
        }) +
          chunk({}, 'tool_calls') +
          'data: [DONE]\n\n',
      );
    } else text('好的');
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
  const events: BusEvent[] = [];
  service.bus.subscribe((e) => events.push(e));
  const idle = () =>
    expect.poll(() => Object.keys(service.snapshot().snapshot.runs).length).toBe(0);
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
    const project = createProject();
    const snapshot = await canvasSnapshot(project, []);

    // A round that ends without report_result gets a card built from its reply.
    const tidy = await service.create(project.id);
    await service.send(tidy, randomUUID(), '慢慢整理画布', 1, snapshot);
    await expect.poll(() => release !== undefined).toBe(true);
    expect(store.record(tidy).view.card).toMatchObject({ status: 'running' });
    release?.();
    await idle();
    expect(store.record(tidy).view.card).toMatchObject({
      status: 'done',
      summary: '画布已整理完毕',
      source: 'auto',
    });
    expect(bodies[0]?.tools?.map((t) => t.function.name)).toContain('report_result');

    // A card the sub-agent writes itself is kept as written.
    const storyboard = await service.create(project.id);
    await service.send(storyboard, randomUUID(), '排分镜，风格需要确认', 1, snapshot);
    await idle();
    expect(store.record(storyboard).view.card).toMatchObject({
      status: 'needs_user',
      summary: '分镜已排好，风格待定',
      artifacts: [{ kind: 'node', ref: 'n1' }],
      openQuestions: ['用写实还是插画？'],
      source: 'agent',
    });
    expect(events.filter((e) => e.sessionId === storyboard).map((e) => e.card.status)).toEqual([
      'needs_user',
    ]);

    // A new home segment starts with the unfinished cards as data; its second round does not.
    const home = await service.create();
    await service.send(home, randomUUID(), '今天进展如何', 1);
    await idle();
    const opening = JSON.stringify(bodies.at(-1)?.messages.at(-1));
    expect(opening).toContain('未完成的空间任务卡片');
    expect(opening).toContain('分镜已排好，风格待定');
    expect(opening).not.toContain('画布已整理完毕');
    expect(bodies.at(-1)?.tools?.map((t) => t.function.name) ?? []).not.toContain('report_result');
    expect(store.record(home).view.card).toBeUndefined();
    await service.send(home, randomUUID(), '继续', 1);
    await idle();
    expect(JSON.stringify(bodies.at(-1)?.messages.at(-1))).not.toContain('未完成的空间任务卡片');

    const reloaded = new AgentStore(new JsonFile(join(root, 'index.json')));
    await reloaded.initialize();
    expect(reloaded.record(storyboard).view.card?.openQuestions).toEqual(['用写实还是插画？']);
    expect(service.snapshot().snapshot.sessions.find((s) => s.id === tidy)?.card?.status).toBe(
      'done',
    );
  } finally {
    release?.();
    await service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

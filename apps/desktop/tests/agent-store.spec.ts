import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import type { AgentEvent, SessionEvent } from '../src/shared/agent';

/** A version 1 index: one home, one canvas and one writing conversation, plus a legacy config. */
function v1Index() {
  const session = (extra: Record<string, unknown>, text: string) => ({
    view: {
      id: randomUUID(),
      title: text,
      model: 'mock',
      modelId: randomUUID(),
      createdAt: 1,
      updatedAt: 2,
      runId: null,
      contextTokens: 10,
      contextWindow: 128000,
      thinkingLevel: 'off',
      messages: [
        { id: randomUUID(), role: 'user', text, status: 'succeeded' },
        {
          id: randomUUID(),
          role: 'assistant',
          text: `回复：${text}🙂`,
          status: 'succeeded',
          completedAt: 3,
          activities: [{ id: 'a1', label: '已读取画布概况', files: [] }],
        },
      ],
      ...extra,
    },
  });
  const home = session({}, '首页');
  const canvas = session({ projectId: randomUUID() }, '画布');
  const writing = session({ writingScope: { rootId: randomUUID(), path: '甲.md' } }, '写作');
  const legacy = {
    ...session({}, '旧配置'),
    config: {
      name: '中转',
      baseUrl: 'https://relay.example/v1',
      api: 'openai-completions',
      model: 'mock',
      contextWindow: null,
      maxTokens: 4096,
    },
  };
  return {
    version: 1,
    sessions: [home, canvas, writing, legacy],
    requests: [
      {
        id: randomUUID(),
        sessionId: home.view.id,
        runId: randomUUID(),
        text: '首页',
        inputHash: 'h',
      },
    ],
  };
}

test('version 1 records migrate with a backup, split into views and read back unchanged', async () => {
  const root = test.info().outputPath('agent');
  await mkdir(root, { recursive: true });
  const raw = v1Index();
  await writeFile(join(root, 'index.json'), JSON.stringify(raw));
  const store = new AgentStore(new JsonFile(join(root, 'index.json')));
  await store.initialize();

  expect(JSON.parse(await readFile(join(root, 'index.v1.bak.json'), 'utf8'))).toEqual(raw);
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
  expect(index.version).toBe(2);
  expect(JSON.stringify(index)).not.toContain('"messages"');
  expect(
    index.sessions.map((s: { meta: { agent: { kind: string } } }) => s.meta.agent.kind),
  ).toEqual(['main', 'canvas', 'writing', 'main']);
  expect(index.sessions[0].meta).toMatchObject({ agent: { origin: 'user' }, lastReplyAt: 3 });
  expect(index.sessions[3].config.name).toBe('中转');
  for (const { view } of raw.sessions) {
    const stored = JSON.parse(
      await readFile(join(root, 'sessions', `${view.id}.view.json`), 'utf8'),
    );
    expect(stored.messages).toEqual(view.messages);
  }

  const reloaded = new AgentStore(new JsonFile(join(root, 'index.json')));
  await reloaded.initialize();
  expect(reloaded.requests).toEqual(raw.requests);
  for (const [i, { view }] of raw.sessions.entries()) {
    const { agent, ...rest } = reloaded.records[i]!.view;
    expect(rest).toEqual(view);
    expect(agent.kind).toBe(['main', 'canvas', 'writing', 'main'][i]);
  }
  expect(reloaded.records[3]?.config?.name).toBe('中转');
});

test('a failed migration keeps the version 1 index so the next start can retry', async () => {
  const root = test.info().outputPath('agent');
  await mkdir(root, { recursive: true });
  const raw = v1Index();
  await writeFile(join(root, 'index.json'), JSON.stringify(raw));
  // A file where the views directory should be makes every view write fail.
  await writeFile(join(root, 'sessions'), '');
  await expect(new AgentStore(new JsonFile(join(root, 'index.json'))).initialize()).rejects.toThrow(
    '原记录已保留',
  );
  expect(JSON.parse(await readFile(join(root, 'index.json'), 'utf8'))).toEqual(raw);
});

test('streaming writes only its own view, and pushes carry metadata or changed messages only', async () => {
  const server = createServer(async (req, res) => {
    for await (const _chunk of req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.write(chunk({ content: '第一段' }));
    await new Promise((r) => setTimeout(r, 1300));
    res.end(chunk({ content: '第二段' }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
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
    const idle = await service.create();
    const busy = await service.create();
    expect(store.records.map((r) => r.view.agent.kind)).toEqual(['main', 'main']);
    const indexEvents: AgentEvent[] = [];
    const sessionEvents: SessionEvent[] = [];
    service.onChange = (e) => indexEvents.push(e);
    service.onSessionChange = (e) => sessionEvents.push(e);
    // Count writes during the round: the 1 s checkpoint must touch only this conversation's view.
    const writes = { index: 0, views: [] as string[] };
    const saveIndex = store.saveIndex.bind(store),
      saveView = store.saveView.bind(store);
    store.saveIndex = () => {
      writes.index++;
      return saveIndex();
    };
    store.saveView = (id) => {
      writes.views.push(id);
      return saveView(id);
    };
    const done = new Promise<void>((resolve) => {
      const previous = service.onChange;
      service.onChange = (e) => {
        previous(e);
        if (!Object.keys(e.snapshot.runs).length && sessionEvents.length) resolve();
      };
    });
    await service.send(busy, randomUUID(), '你好', 1);
    await done;

    expect(
      indexEvents.every((e) => !JSON.stringify(e.snapshot.sessions).includes('"messages"')),
    ).toBe(true);
    expect(sessionEvents.every((e) => e.sessionId === busy)).toBe(true);
    expect(sessionEvents.some((e) => e.sessionId === idle)).toBe(false);
    const seqs = [...indexEvents, ...sessionEvents].map((e) => e.seq).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(sessionEvents[0]?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(sessionEvents.slice(1).every((e) => e.messages.length === 1)).toBe(true);
    expect(sessionEvents.at(-1)?.messages[0]).toMatchObject({
      text: '第一段第二段',
      status: 'succeeded',
    });
    // Every pushed message reaches the renderer before the metadata that closes the round.
    const closing = indexEvents.at(-1)!;
    expect(closing.seq).toBeGreaterThan(sessionEvents.at(-1)!.seq);
    const { seq, session } = service.session(busy);
    expect(seq).toBe(closing.seq);
    expect(session.messages.map((m) => m.text)).toEqual(['你好', '第一段第二段']);
    expect(session.lastReplyAt).toBeGreaterThan(0);
    const view = JSON.parse(await readFile(join(root, 'sessions', `${busy}.view.json`), 'utf8'));
    expect(view.messages[1].text).toBe('第一段第二段');
    expect(JSON.parse(await readFile(join(root, 'sessions', `${idle}.view.json`), 'utf8'))).toEqual(
      {
        version: 1,
        messages: [],
      },
    );
    // One index write when the round starts and one when it ends; checkpoints wrote views only.
    expect(writes.index).toBe(2);
    expect(writes.views.length).toBeGreaterThanOrEqual(3);
    expect(writes.views.every((id) => id === busy)).toBe(true);
    await service.deleteSession(idle);
    await expect(stat(join(root, 'sessions', `${idle}.view.json`))).rejects.toThrow();
  } finally {
    await service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

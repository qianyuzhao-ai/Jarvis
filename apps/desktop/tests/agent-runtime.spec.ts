import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { openAgent } from '../src/main/agent/runtime';
import { AgentStore } from '../src/main/agent/store';
import { JsonFile } from '../src/main/agent/json-file';
import { relayModel } from './helpers/models';

test('Pi SDK streams Unicode, suppresses tools, detects incomplete SSE and supports abort', async () => {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(input);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const event = (delta: string, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'chat_test', object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, delta: { content: delta }, finish_reason: finish }] })}\n\n`;
    const bytes = Buffer.from(event('中文🙂'));
    res.write(bytes.subarray(0, bytes.length - 9));
    res.write(bytes.subarray(bytes.length - 9));
    if (input.model === 'abort') return;
    if (input.model !== 'incomplete') res.write(event('', 'stop'));
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw Error('server');
  const config = relayModel({
    baseUrl: `http://127.0.0.1:${addr.port}/v1`,
    model: 'complete',
    apiKey: 'test-secret',
  });
  try {
    for (const model of ['complete', 'incomplete', 'abort']) {
      const { session } = await openAgent(
        test.info().outputPath('runtime'),
        randomUUID(),
        { ...config, modelId: model, name: model },
        true,
      );
      try {
        expect(session.getActiveToolNames()).toEqual([]);
        let output = '';
        session.subscribe((event) => {
          if (
            event.type === 'message_update' &&
            event.assistantMessageEvent.type === 'text_delta'
          ) {
            output += event.assistantMessageEvent.delta;
            if (model === 'abort') void session.abort();
          }
        });
        await session.prompt('Hello', { expandPromptTemplates: false });
        expect(output).toBe('中文🙂');
        const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
        expect(last?.stopReason).toBe(
          model === 'complete' ? 'stop' : model === 'abort' ? 'aborted' : 'error',
        );
      } finally {
        session.dispose();
      }
    }
    expect(requests).toHaveLength(3);
    expect(
      requests.every((r) => r.stream === true && (!r.tools || (r.tools as unknown[]).length === 0)),
    ).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('agent records recover unfinished runs without reissuing requests', async () => {
  const file = new JsonFile(test.info().outputPath('index.json'));
  const store = new AgentStore(file);
  const id = await store.create(relayModel({ baseUrl: 'http://localhost:1234/v1', model: 'mock' }));
  const r = store.record(id);
  r.view.runId = randomUUID();
  r.view.messages.push({
    id: randomUUID(),
    role: 'assistant',
    text: '部分内容',
    status: 'running',
  });
  await store.save();
  const recovered = new AgentStore(file);
  await recovered.initialize();
  expect(recovered.record(id).view.runId).toBeNull();
  expect(recovered.record(id).view.messages[0]?.status).toBe('interrupted');
  expect(recovered.record(id).view.messages[0]?.text).toBe('部分内容');
});

test('upstream authentication errors cannot persist a reflected API Key in SDK history', async () => {
  const secret = 'secret-reflected-by-relay';
  const server = createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `invalid key: ${secret}` } }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('server');
  const id = randomUUID(),
    root = test.info().outputPath('runtime');
  const config = relayModel({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'mock',
    apiKey: secret,
  });
  const { session } = await openAgent(root, id, config);
  try {
    await session.prompt('Hello', { expandPromptTemplates: false });
    expect(session.messages.filter((m) => m.role === 'assistant').at(-1)?.stopReason).toBe('error');
    expect(JSON.stringify(session.messages)).not.toContain(secret);
    expect(await readFile(join(root, 'sessions', `${id}.jsonl`), 'utf8')).not.toContain(secret);
  } finally {
    session.dispose();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

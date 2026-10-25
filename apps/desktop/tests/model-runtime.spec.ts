import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { digitsPng } from '../src/main/agent/probe-image';
import { openAgent } from '../src/main/agent/runtime';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import type { ThinkingLevel } from '../src/shared/models';
import { catalogModel, relayModel } from './helpers/models';

type Captured = { body: Record<string, unknown>; authorization?: string };
async function body(req: IncomingMessage) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
}
function sse(model: unknown, text: string) {
  const chunk = (delta: unknown, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  return chunk({ content: text }) + chunk({}, 'stop') + 'data: [DONE]\n\n';
}
/** A Chat Completions server that records requests and answers with `reply(body)`. */
async function relay(reply: (body: Record<string, unknown>) => string | number = () => 'OK') {
  const requests: Captured[] = [];
  const server = createServer(async (req, res) => {
    const input = await body(req);
    requests.push({ body: input, authorization: req.headers.authorization });
    const answer = reply(input);
    if (typeof answer === 'number') {
      res.writeHead(answer, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'image input is not supported' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sse(input.model, answer));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  return { requests, server, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}
async function ask(model: Parameters<typeof openAgent>[2], level: ThinkingLevel = 'off') {
  const { session } = await openAgent(
    test.info().outputPath(randomUUID()),
    randomUUID(),
    model,
    true,
    undefined,
    level,
  );
  try {
    await session.prompt('Hello', { expandPromptTemplates: false });
  } finally {
    session.dispose();
  }
}

test('custom models omit the output limit when it is automatic and send it when set', async () => {
  const { requests, server, baseUrl } = await relay();
  try {
    await ask(relayModel({ baseUrl, model: 'auto', maxTokens: null }));
    await ask(relayModel({ baseUrl, model: 'fixed', maxTokens: 2048 }));
    const [auto, fixed] = requests.map((r) => r.body);
    expect(auto).not.toHaveProperty('max_tokens');
    expect(auto).not.toHaveProperty('max_completion_tokens');
    expect(fixed?.max_completion_tokens).toBe(2048);
  } finally {
    server.close();
  }
});

test('thinking levels reach custom and built-in models only when the model supports them', async () => {
  const { requests, server, baseUrl } = await relay();
  const levels: ThinkingLevel[] = ['off', 'low', 'medium', 'high'];
  try {
    await ask(relayModel({ baseUrl, model: 'think', thinkingLevels: levels }), 'high');
    await ask(relayModel({ baseUrl, model: 'think', thinkingLevels: levels }), 'off');
    await ask(relayModel({ baseUrl, model: 'plain' }), 'high');
    const [high, off, plain] = requests.map((r) => r.body);
    expect(high?.reasoning_effort).toBe('high');
    expect(off).not.toHaveProperty('reasoning_effort');
    expect(plain).not.toHaveProperty('reasoning_effort');
  } finally {
    server.close();
  }
  const original = globalThis.fetch;
  const seen: Captured[] = [];
  process.env.DEEPSEEK_API_KEY = 'env-secret';
  globalThis.fetch = async (url, init) => {
    const request = new Request(url, init);
    seen.push({
      body: (await request.json()) as Record<string, unknown>,
      authorization: request.headers.get('authorization') ?? undefined,
    });
    return new Response(sse('deepseek-flash', 'OK'), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  try {
    await ask(catalogModel('deepseek', 'deepseek-flash', 'runtime-key'), 'high');
    await ask(catalogModel('deepseek', 'deepseek-flash', 'runtime-key'), 'off');
  } finally {
    globalThis.fetch = original;
    delete process.env.DEEPSEEK_API_KEY;
  }
  // The saved Key always wins over a personal DEEPSEEK_API_KEY in the environment.
  expect(seen.every((r) => r.authorization === 'Bearer runtime-key')).toBe(true);
  expect(seen[0]?.body.thinking).not.toEqual({ type: 'disabled' });
  expect(seen[1]?.body.thinking).toEqual({ type: 'disabled' });
});

/** Reads the four digits back from a probe image using the generator's own glyphs. */
function readDigits(png: Buffer) {
  const decode = (buffer: Buffer) => {
    let offset = 8;
    let width = 0;
    const data: Buffer[] = [];
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const chunk = buffer.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') width = chunk.readUInt32BE(0);
      if (type === 'IDAT') data.push(chunk);
      offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(data));
    return (x: number, y: number) => pixels[y * (width + 1) + 1 + x] === 0;
  };
  const glyph = (dark: (x: number, y: number) => boolean, index: number) =>
    Array.from({ length: 35 }, (_, i) =>
      dark(24 + (index * 6 + (i % 5)) * 12 + 6, 24 + Math.floor(i / 5) * 12 + 6) ? '1' : '0',
    ).join('');
  const reference = decode(digitsPng('0123456789'));
  const glyphs = Array.from({ length: 10 }, (_, d) => glyph(reference, d));
  const target = decode(png);
  return Array.from({ length: 4 }, (_, i) => glyphs.indexOf(glyph(target, i))).join('');
}

test('vision probes record support, rejection and leave failures unconfirmed', async () => {
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const root = test.info().outputPath('agent');
  const models = new ModelStore(new JsonFile(`${root}/connection.json`), cipher);
  await models.initialize();
  const service = new AgentService(
    models,
    new AgentStore(new JsonFile(`${root}/index.json`)),
    root,
  );
  let mode: 'read' | 'wrong' | 'reject' = 'read';
  const { requests, server, baseUrl } = await relay((input) => {
    const parts = (input.messages as { content: unknown }[]).flatMap((m) =>
      Array.isArray(m.content) ? m.content : [],
    ) as { type: string; image_url?: { url: string } }[];
    const image = parts.find((p) => p.type === 'image_url')?.image_url?.url ?? '';
    if (mode === 'reject') return 400;
    if (mode === 'wrong') return '0000';
    return readDigits(Buffer.from(image.split(',')[1] ?? '', 'base64'));
  });
  try {
    const providerId = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl,
      api: 'openai-completions',
      apiKey: 'k',
      clearKey: false,
    });
    const [id] = await models.setProviderModels(providerId, [{ modelId: 'qwen3:32b' }]);
    const vision = () => models.view().models[0]!;
    expect(vision()).toMatchObject({ vision: 'unknown' });
    expect(await service.probeVision(id!, 1)).toMatchObject({ vision: 'supported' });
    expect(vision()).toMatchObject({ vision: 'supported', visionSource: 'probe' });
    expect(requests.at(-1)?.body.messages).toBeTruthy();
    mode = 'wrong';
    expect(await service.probeVision(id!, 1)).toMatchObject({ vision: 'unsupported' });
    mode = 'reject';
    expect(await service.probeVision(id!, 1)).toMatchObject({ vision: 'unsupported' });
    expect(vision()).toMatchObject({ vision: 'unsupported', visionSource: 'probe' });
    server.close();
    expect(await service.probeVision(id!, 1)).toMatchObject({ vision: 'unknown' });
    expect(vision()).toMatchObject({ vision: 'unsupported', visionSource: 'probe' });
  } finally {
    server.close();
    await service.shutdown();
  }
});

test('sessions keep a thinking level the model supports and refuse images the model cannot read', async () => {
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const root = test.info().outputPath('agent');
  const models = new ModelStore(new JsonFile(`${root}/connection.json`), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(`${root}/index.json`));
  const service = new AgentService(models, store, root);
  try {
    const ds = await models.saveProvider({ kind: 'builtin', sdkProvider: 'deepseek', apiKey: 'k' });
    const [flash, pro] = await models.setProviderModels(ds, [
      { modelId: 'deepseek-flash' },
      { modelId: 'deepseek-v4-pro' },
    ]);
    const relayId = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: 'https://relay.example/v1',
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    const [unknown] = await models.setProviderModels(relayId, [{ modelId: 'qwen3:32b' }]);
    const session = await service.create();
    expect(store.record(session).view).toMatchObject({ modelId: flash, thinkingLevel: 'off' });
    await expect(service.setThinkingLevel(session, 'medium')).rejects.toThrow('不支持这个思考档位');
    await service.setThinkingLevel(session, 'low');
    await service.setModel(session, pro!);
    expect(store.record(session).view.thinkingLevel).toBe('off');
    await service.setModel(session, flash!);
    await service.setThinkingLevel(session, 'max');
    expect((await service.create()) && store.records.at(-1)?.view.thinkingLevel).toBe('max');
    store.record(session).view.messages.push({
      id: randomUUID(),
      role: 'user',
      text: 'look',
      status: 'succeeded',
      visionAssets: [
        { nodeId: 'n', name: 'a.png', kind: 'image', preview: 'data:image/png;base64,AA==' },
      ],
    });
    await expect(service.setModel(session, pro!)).rejects.toThrow('不支持图片');
    await expect(service.setModel(session, unknown!)).rejects.toThrow('图片能力未确认');
    expect(models.resolve(pro).vision).toBe('unsupported');
  } finally {
    await service.shutdown();
  }
});

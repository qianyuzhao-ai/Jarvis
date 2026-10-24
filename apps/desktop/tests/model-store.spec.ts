import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { ModelStore } from '../src/main/agent/model-store';
import { nearestThinkingLevel } from '../src/shared/models';

/** Reversible stand-in for safeStorage; values starting with "bad" cannot be decrypted. */
function cipher(available = true): KeyCipher {
  return {
    available: () => available,
    encrypt: (text) => `enc:${Buffer.from(text).toString('base64')}`,
    decrypt: (value) => {
      if (!value.startsWith('enc:')) throw new Error('cannot decrypt');
      return Buffer.from(value.slice(4), 'base64').toString();
    },
  };
}
const enc = (text: string) => cipher().encrypt(text);
async function store(
  file = test.info().outputPath(`connection-${randomUUID()}.json`),
  c = cipher(),
) {
  const s = new ModelStore(new JsonFile(file), c);
  await s.initialize();
  return { s, file };
}

test('v2 settings migrate into providers that share endpoint and Key, keeping model IDs', async () => {
  const file = test.info().outputPath('connection.json');
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const relay = {
    provider: 'relay',
    baseUrl: 'https://relay.example/v1',
    api: 'openai-completions',
  };
  const legacy = {
    version: 2,
    defaultModelId: ids[1],
    models: [
      {
        id: ids[0],
        config: {
          ...relay,
          name: '我的中转站',
          model: 'gpt-5.2',
          contextWindow: null,
          maxTokens: 4096,
        },
        encryptedKey: enc('relay-key'),
      },
      {
        id: ids[1],
        config: {
          ...relay,
          name: 'Claude 写作',
          model: 'claude-sonnet-4.5',
          contextWindow: 200000,
          maxTokens: 8000,
        },
        encryptedKey: enc('relay-key'),
      },
      {
        id: ids[2],
        config: {
          ...relay,
          name: '另一个 Key',
          model: 'gpt-5.2',
          contextWindow: null,
          maxTokens: 4096,
        },
        encryptedKey: enc('other-key'),
      },
      {
        id: ids[3],
        config: {
          provider: 'deepseek',
          name: 'DeepSeek 官方',
          baseUrl: 'https://api.deepseek.com',
          api: 'openai-completions',
          model: 'deepseek-flash',
          contextWindow: 1000000,
          maxTokens: 4096,
        },
        encryptedKey: enc('ds-key'),
      },
      {
        id: ids[4],
        config: {
          ...relay,
          name: '坏 Key',
          model: 'qwen3:32b',
          contextWindow: null,
          maxTokens: 4096,
        },
        encryptedKey: 'bad-blob',
      },
    ],
  };
  await writeFile(file, JSON.stringify(legacy));
  const { s } = await store(file);
  const view = s.view();
  expect(view.defaultModelId).toBe(ids[1]);
  expect(view.models.map((m) => m.id)).toEqual(ids);
  expect(view.providers).toHaveLength(4);
  const [shared, other, deepseek, broken] = view.providers;
  expect(shared).toMatchObject({ kind: 'custom', name: '我的中转站', hasKey: true });
  expect(view.models.filter((m) => m.providerId === shared!.id).map((m) => m.modelId)).toEqual([
    'gpt-5.2',
    'claude-sonnet-4.5',
  ]);
  expect(other).toMatchObject({ kind: 'custom', hasKey: true });
  expect(deepseek).toMatchObject({ kind: 'builtin', sdkProvider: 'deepseek', name: 'DeepSeek' });
  expect(broken).toMatchObject({ keyError: true, hasKey: false });
  const claude = view.models[1]!;
  expect(claude).toMatchObject({
    label: 'Claude 写作',
    contextWindow: 200000,
    contextSource: 'manual',
    maxTokens: 8000,
  });
  // The legacy 4096 default is not carried over: the catalog value applies instead.
  expect(view.models[0]).toMatchObject({ maxTokens: 128000, maxTokensSource: 'catalog' });
  expect(view.models[0]?.label).toBeUndefined();
  expect(view.models[3]).toMatchObject({ name: 'DeepSeek V4.1 Flash', maxTokens: 384000 });
  expect(() => s.resolve(ids[4])).toThrow('无法解密');
  expect(s.resolve(ids[0]).apiKey).toBe('relay-key');
  const stored = JSON.parse(await readFile(file, 'utf8'));
  expect(stored.version).toBe(3);
  expect(JSON.parse(await readFile(file.replace(/\.json$/, '.v2.bak.json'), 'utf8'))).toEqual(
    legacy,
  );
});

test('migration stops and keeps the original file when the system key store is unavailable', async () => {
  const file = test.info().outputPath('locked.json');
  const id = randomUUID();
  const original = JSON.stringify({
    version: 2,
    defaultModelId: id,
    models: [
      {
        id,
        config: {
          name: 'r',
          baseUrl: 'https://r.example/v1',
          api: 'openai-completions',
          model: 'm',
        },
        encryptedKey: enc('k'),
      },
    ],
  });
  await writeFile(file, original);
  await expect(store(file, cipher(false))).rejects.toThrow('系统密钥存储不可用');
  expect(await readFile(file, 'utf8')).toBe(original);
});

test('custom model capabilities layer manual over probe over relay over catalog', async () => {
  const { s } = await store();
  const providerId = await s.saveProvider({
    kind: 'custom',
    name: '星河中转',
    baseUrl: 'https://relay.example/v1',
    api: 'openai-completions',
    apiKey: 'k',
    clearKey: false,
  });
  const [gpt, qwen, glm, listed] = await s.setProviderModels(providerId, [
    { modelId: 'gpt-5.2' },
    { modelId: 'qwen3:32b' },
    { modelId: 'glm-5.3' },
    { modelId: 'vendor/qwen3:32b', providerVision: true },
  ]);
  const view = () => Object.fromEntries(s.view().models.map((m) => [m.id, m]));
  expect(view()[gpt!]).toMatchObject({
    vision: 'supported',
    visionSource: 'catalog',
    thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh'],
    contextWindow: 400000,
    maxTokens: 128000,
  });
  expect(view()[qwen!]).toMatchObject({
    vision: 'unknown',
    thinkingLevels: [],
    contextWindow: null,
    maxTokens: null,
  });
  expect(view()[glm!]).toMatchObject({ vision: 'unknown' });
  expect(view()[listed!]).toMatchObject({ vision: 'supported', visionSource: 'provider' });
  await s.recordProbe(qwen!, 'unsupported');
  expect(view()[qwen!]).toMatchObject({ vision: 'unsupported', visionSource: 'probe' });
  await s.updateModel({
    id: qwen!,
    vision: 'supported',
    thinkingLevels: ['low', 'high'],
    contextWindow: 32768,
    maxTokens: 8192,
  });
  expect(view()[qwen!]).toMatchObject({
    vision: 'supported',
    visionSource: 'manual',
    thinkingLevels: ['off', 'low', 'high'],
    contextWindow: 32768,
    maxTokens: 8192,
  });
  expect(s.resolve(qwen!).thinkingLevelMap).toMatchObject({
    minimal: null,
    medium: null,
    max: null,
  });
  await s.updateModel({
    id: qwen!,
    vision: 'auto',
    thinkingLevels: 'auto',
    contextWindow: 'auto',
    maxTokens: 'auto',
  });
  expect(view()[qwen!]).toMatchObject({
    vision: 'unsupported',
    visionSource: 'probe',
    thinkingLevels: [],
    maxTokens: null,
  });
  await expect(s.updateModel({ id: gpt!, maxTokens: 500000 })).rejects.toThrow(
    '输出上限必须小于上下文容量',
  );
});

test('built-in providers use the catalog, require a Key and keep model IDs when the list changes', async () => {
  const { s } = await store();
  await expect(
    s.saveProvider({ kind: 'builtin', sdkProvider: 'deepseek', apiKey: '' }),
  ).rejects.toThrow('API Key');
  await expect(
    s.saveProvider({ kind: 'builtin', sdkProvider: 'amazon-bedrock', apiKey: 'k' }),
  ).rejects.toThrow('不支持');
  const id = await s.saveProvider({ kind: 'builtin', sdkProvider: 'deepseek', apiKey: 'ds' });
  await expect(s.setProviderModels(id, [{ modelId: 'not-in-catalog' }])).rejects.toThrow(
    '目录中没有',
  );
  const [flash, pro] = await s.setProviderModels(id, [
    { modelId: 'deepseek-flash' },
    { modelId: 'deepseek-v4-pro' },
  ]);
  expect(s.view().defaultModelId).toBe(flash);
  expect(s.resolve(flash!)).toMatchObject({
    vision: 'supported',
    thinkingLevels: ['off', 'low', 'high', 'max'],
    maxTokens: 384000,
    apiKey: 'ds',
  });
  expect(s.resolve(pro!)).toMatchObject({
    vision: 'unsupported',
    thinkingLevels: ['off', 'high', 'max'],
  });
  await expect(s.updateModel({ id: pro!, vision: 'supported' })).rejects.toThrow('内置服务商');
  await s.updateModel({ id: pro!, label: '推理' });
  const again = await s.setProviderModels(id, [{ modelId: 'deepseek-v4-pro' }]);
  expect(again).toEqual([pro]);
  expect(s.view().models.find((m) => m.id === pro)?.label).toBe('推理');
  expect(s.view().defaultModelId).toBe(pro);
  await s.removeProvider(id);
  expect(s.view()).toMatchObject({ providers: [], models: [], defaultModelId: null });
  expect(() => s.resolve()).toThrow('请先添加模型');
});

test('custom provider Keys stay with their endpoint and can be cleared for keyless servers', async () => {
  const { s } = await store();
  const base = {
    kind: 'custom' as const,
    name: '本地',
    baseUrl: 'https://a.example/v1',
    api: 'openai-completions' as const,
    clearKey: false,
  };
  const id = await s.saveProvider({ ...base, apiKey: 'secret' });
  await s.saveProvider({ ...base, id, apiKey: '', name: '本地 2' });
  expect(s.connection({ ...base, id, apiKey: '' }).apiKey).toBe('secret');
  await expect(
    s.saveProvider({ ...base, id, apiKey: '', baseUrl: 'https://b.example/v1' }),
  ).rejects.toThrow('更换地址');
  await s.saveProvider({
    ...base,
    id,
    apiKey: '',
    baseUrl: 'https://b.example/v1',
    clearKey: true,
  });
  expect(s.view().providers[0]).toMatchObject({
    name: '本地',
    hasKey: false,
    baseUrl: 'https://b.example/v1',
  });
  await expect(
    s.saveProvider({ kind: 'builtin', sdkProvider: 'deepseek', id, apiKey: 'x' }),
  ).rejects.toThrow('类型');
});

test('relay model lists keep reported image support and infer the rest from the catalog', async () => {
  const server = createServer((req, res) => {
    expect(req.headers.authorization).toBe('Bearer list-key');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        data: [
          { id: 'gpt-5.2' },
          { id: 'qwen3:32b' },
          { id: 'vision-x', architecture: { input_modalities: ['text', 'image'] } },
          { id: 'gpt-5.2' },
        ],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  try {
    const { s } = await store();
    const list = await s.candidates({
      kind: 'custom',
      name: 'r',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: 'openai-completions',
      apiKey: 'list-key',
      clearKey: false,
    });
    expect(list.map((m) => [m.id, m.vision, m.visionKnown, m.visionSource])).toEqual([
      ['gpt-5.2', true, true, 'catalog'],
      ['qwen3:32b', false, false, 'unknown'],
      ['vision-x', true, true, 'provider'],
    ]);
  } finally {
    server.close();
  }
});

test('thinking levels fall back to the closest supported level, preferring the lower one', () => {
  expect(nearestThinkingLevel(['off', 'low', 'high', 'max'], 'medium')).toBe('low');
  expect(nearestThinkingLevel(['off', 'high', 'max'], 'low')).toBe('off');
  expect(nearestThinkingLevel(['off', 'low', 'medium', 'high', 'xhigh'], 'max')).toBe('xhigh');
  expect(nearestThinkingLevel([], 'high')).toBe('off');
});

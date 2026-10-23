import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { DEEPSEEK_BASE_URL } from '../src/shared/agent';

test('my models migrates legacy credentials, persists multiple providers and switches one chat across models', async () => {
  test.setTimeout(60000);
  const calls: { path: string; authorization: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ path: req.url ?? '', authorization: req.headers.authorization ?? '', body });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'models-mock', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      chunk({ content: `来自 ${body.model} 的回复` }) + chunk({}, 'stop') + 'data: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  const origin = `http://127.0.0.1:${address.port}`;
  const launch = () =>
    electron.launch({
      args: [
        resolve(import.meta.dirname, '..'),
        `--user-data-dir=${test.info().outputPath('profile')}`,
      ],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '配置模型服务' }).waitFor();
    const stored = await page.evaluate(
      async (baseUrl) =>
        window.desktop!.agent.saveConfiguration({
          config: {
            name: '旧中转站',
            baseUrl,
            api: 'openai-completions',
            model: 'mock',
            contextWindow: null,
            maxTokens: 4096,
          },
          apiKey: 'relay-old-key',
          clearKey: false,
        }),
      origin + '/v1',
    );
    expect(stored.ok).toBe(true);
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    const file = join(userData, 'agent', 'connection.json');
    await app.close();
    const before = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(
      file,
      JSON.stringify({
        config: before.models[0].config,
        encryptedKey: before.models[0].encryptedKey,
      }),
    );
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '模型服务', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(1);
    expect(JSON.parse(await readFile(file, 'utf8')).version).toBe(2);
    await app.evaluate((_electron, origin) => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin !== 'https://api.deepseek.com') return originalFetch(request);
        return originalFetch(origin + '/official' + url.pathname, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          duplex: 'half',
        } as RequestInit);
      };
    }, origin);
    await page.getByRole('button', { name: '添加模型', exact: true }).click();
    await page.getByLabel('服务来源').selectOption('deepseek');
    await expect(page.getByLabel('API 地址', { exact: true })).toHaveValue(DEEPSEEK_BASE_URL);
    await expect(page.getByLabel('API 地址', { exact: true })).toHaveAttribute('readonly', '');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('DeepSeek API Key');
    expect(calls).toHaveLength(0);
    await page.getByLabel('API Key', { exact: true }).fill('deepseek-own-key');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '连接成功' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('deepseek-settings.png') });
    await page.getByRole('button', { name: '保存更改', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(2);
    await page.getByRole('button', { name: '添加模型', exact: true }).click();
    await page.getByLabel('模型名称').fill('中转 Beta');
    await page.getByLabel('API 地址', { exact: true }).fill(origin + '/v1');
    await page.getByLabel('API Key', { exact: true }).fill('relay-beta-key');
    await page.getByLabel('模型 ID', { exact: true }).fill('beta');
    await page.getByRole('button', { name: '保存更改', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(3);
    await page.getByRole('button', { name: '设为默认：DeepSeek 官方' }).click();
    await expect(
      page.getByTestId('configured-model').filter({ hasText: 'DeepSeek 官方' }),
    ).toContainText('默认模型');
    await page.screenshot({ path: test.info().outputPath('my-models.png') });
    const configured = await page.evaluate(async () => window.desktop!.agent.getConfiguration());
    if (!configured.ok) throw new Error(configured.error);
    const models = configured.value.models ?? [];
    const relay = models.find((m) => m.config.name === '旧中转站');
    const deepseek = models.find((m) => m.config.provider === 'deepseek');
    const beta = models.find((m) => m.config.model === 'beta');
    if (!relay || !deepseek || !beta) throw new Error('Missing configured models');
    expect(JSON.stringify(configured)).not.toContain('deepseek-own-key');
    const savedText = await readFile(file, 'utf8');
    for (const key of ['relay-old-key', 'deepseek-own-key', 'relay-beta-key'])
      expect(savedText).not.toContain(key);
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '聊天模型' })).toHaveValue(deepseek.id);
    let count = 0;
    for (const [profile, text] of [
      [relay, '第一条'],
      [deepseek, '继续第二条'],
      [beta, '第三条'],
    ] as const) {
      await page.getByRole('combobox', { name: '聊天模型' }).selectOption(profile.id);
      await page.getByLabel('消息', { exact: true }).fill(text);
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      await expect(
        page.locator(
          '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
        ),
      ).toHaveCount(++count);
    }
    expect(calls.map((c) => c.body.model)).toEqual([
      'deepseek-flash',
      'mock',
      'deepseek-flash',
      'beta',
    ]);
    expect(calls.map((c) => c.authorization)).toEqual([
      'Bearer deepseek-own-key',
      'Bearer relay-old-key',
      'Bearer deepseek-own-key',
      'Bearer relay-beta-key',
    ]);
    expect(calls[2]?.path).toBe('/official/chat/completions');
    expect(JSON.stringify(calls[2]?.body.messages)).toContain('第一条');
    expect(JSON.stringify(calls[3]?.body.messages)).toContain('继续第二条');
    const snapshot = await page.evaluate(async () => window.desktop!.agent.getSnapshot());
    expect(snapshot.ok && snapshot.value.snapshot.sessions).toHaveLength(1);
    expect(snapshot.ok && snapshot.value.snapshot.sessions[0]?.modelId).toBe(beta.id);
    await page.screenshot({ path: test.info().outputPath('chat-model-switch.png') });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '模型服务', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(3);
    await page.getByRole('button', { name: '编辑模型：中转 Beta' }).click();
    await expect(page.getByLabel('API Key', { exact: true })).toHaveAttribute(
      'placeholder',
      '已保存，留空保留原 Key',
    );
    await page.getByLabel('模型名称').fill('Beta 新名称');
    await page.getByRole('button', { name: '保存更改', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toContainText([
      '旧中转站',
      'DeepSeek 官方',
      'Beta 新名称',
    ]);
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: '删除模型：Beta 新名称' }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(3);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: '删除模型：Beta 新名称' }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(2);
    if (!snapshot.ok || !snapshot.value.snapshot.sessions[0]) throw new Error('Missing chat');
    const sessionId = snapshot.value.snapshot.sessions[0].id;
    const rejected = await page.evaluate(
      async (id) =>
        window.desktop!.agent.send({
          sessionId: id,
          requestId: crypto.randomUUID(),
          text: '已删除模型不能发送',
        }),
      sessionId,
    );
    expect(rejected.ok).toBe(false);
    expect(calls).toHaveLength(4);
    const bad = await page.evaluate(
      async ({ baseUrl }) =>
        window.desktop!.agent.saveConfiguration({
          create: true,
          config: {
            provider: 'deepseek',
            name: 'invalid',
            baseUrl,
            api: 'openai-completions',
            model: 'deepseek-flash',
            contextWindow: null,
            maxTokens: 4096,
          },
          apiKey: 'test',
          clearKey: false,
        }),
      { baseUrl: origin },
    );
    expect(bad.ok).toBe(false);
    const imageBlocked = await page.evaluate(async () => {
      const bridge = window.desktop!.agent;
      const saved = await bridge.saveConfiguration({
        create: true,
        config: {
          provider: 'deepseek',
          name: 'Pro',
          baseUrl: 'https://api.deepseek.com',
          api: 'openai-completions',
          model: 'deepseek-v4-pro',
          contextWindow: 1_000_000,
          maxTokens: 4096,
        },
        apiKey: 'pro-own-key',
        clearKey: false,
      });
      if (!saved.ok) throw new Error(saved.error);
      const pro = saved.value.models?.find((entry) => entry.config.name === 'Pro');
      if (!pro) throw new Error('Missing Pro model');
      const projectId = crypto.randomUUID();
      const created = await bridge.createCanvasSession(projectId);
      if (!created.ok) throw new Error(created.error);
      const selected = await bridge.setModel({ sessionId: created.value, model: pro.id });
      if (!selected.ok) throw new Error(selected.error);
      return bridge.send({
        sessionId: created.value,
        requestId: crypto.randomUUID(),
        text: '识别图片',
        canvas: {
          projectId,
          name: '图片测试',
          revision: '1',
          selectedIds: ['source'],
          nodes: [
            {
              id: 'source',
              type: 'asset',
              kind: 'image',
              name: 'test.png',
              x: 0,
              y: 0,
              status: 'ready',
              referenceCount: 0,
            },
          ],
          edges: [],
        },
        images: [
          {
            nodeId: 'source',
            name: 'test.png',
            kind: 'image',
            preview: 'data:image/jpeg;base64,/9j/',
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9sAAAAASUVORK5CYII=',
          },
        ],
      });
    });
    expect(imageBlocked.ok).toBe(false);
    expect(!imageBlocked.ok && imageBlocked.error).toContain('不支持图片');
    expect(calls).toHaveLength(4);
    await app.close();
    const indexFile = join(userData, 'agent', 'index.json');
    const legacyIndex = JSON.parse(await readFile(indexFile, 'utf8'));
    const legacyRecord = legacyIndex.sessions.find(
      (record: { view: { id: string } }) => record.view.id === sessionId,
    );
    delete legacyRecord.view.modelId;
    await writeFile(indexFile, JSON.stringify(legacyIndex));
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('combobox', { name: '聊天模型' })).toHaveValue('');
    await expect(page.locator('[data-testid="model-trigger"] option:checked')).toHaveText('beta');
    await page.getByRole('combobox', { name: '聊天模型' }).selectOption(deepseek.id);
    await expect(page.getByRole('combobox', { name: '聊天模型' })).toHaveValue(deepseek.id);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

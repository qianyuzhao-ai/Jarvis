import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('model settings migrate legacy credentials, add providers in the dialog and switch one chat across models', async () => {
  test.setTimeout(60000);
  const calls: { path: string; authorization: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    if (req.url?.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'beta' }, { id: 'mock' }] }));
      return;
    }
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
  // Sends DeepSeek requests to the local mock; must be reinstalled after each relaunch.
  const redirectDeepSeek = () =>
    app.evaluate((_electron, origin) => {
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
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '前往模型设置' }).waitFor();
    // Produce a Key encrypted by this profile's safeStorage, then rewrite it as the oldest file format.
    const seeded = await page.evaluate(
      async (baseUrl) =>
        window.desktop!.models.saveProvider({
          kind: 'custom',
          name: 'seed',
          baseUrl,
          api: 'openai-completions',
          apiKey: 'relay-old-key',
          clearKey: false,
        }),
      origin + '/v1',
    );
    expect(seeded.ok).toBe(true);
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    const file = join(userData, 'agent', 'connection.json');
    await app.close();
    const before = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(
      file,
      JSON.stringify({
        config: {
          name: '旧中转站',
          baseUrl: origin + '/v1',
          api: 'openai-completions',
          model: 'mock',
          contextWindow: null,
          maxTokens: 4096,
        },
        encryptedKey: before.providers[0].encryptedKey,
      }),
    );
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(1);
    await expect(page.getByTestId('provider-card')).toContainText('旧中转站');
    expect(JSON.parse(await readFile(file, 'utf8')).version).toBe(3);
    expect(
      JSON.parse(await readFile(join(userData, 'agent', 'connection.v2.bak.json'), 'utf8')).config
        .model,
    ).toBe('mock');
    await redirectDeepSeek();
    let dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: '添加服务商', exact: true }).click();
    await dialog.getByRole('button', { name: /^DeepSeek/ }).click();
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '连接 DeepSeek' })).toBeVisible();
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('DeepSeek API Key');
    expect(calls).toHaveLength(0);
    await dialog.getByLabel('API Key', { exact: true }).fill('deepseek-own-key');
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('连接成功');
    await page.screenshot({ path: test.info().outputPath('deepseek-connect.png') });
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByTestId('model-option')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: '添加 0 个模型' })).toBeDisabled();
    await dialog.getByRole('checkbox', { name: '启用 deepseek-flash' }).click();
    await dialog.getByRole('button', { name: '添加 1 个模型', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('configured-model')).toHaveCount(2);
    await page.getByRole('button', { name: '添加服务商', exact: true }).click();
    await dialog.getByRole('button', { name: /自定义接口/ }).click();
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await dialog.getByLabel('名称', { exact: true }).fill('中转 Beta');
    await dialog.getByLabel('接口地址', { exact: true }).fill(origin + '/v1');
    await dialog.getByLabel('API Key', { exact: true }).fill('relay-beta-key');
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByTestId('model-option')).toHaveCount(2);
    await dialog.getByRole('checkbox', { name: '启用 beta' }).click();
    await dialog.getByRole('button', { name: '添加 1 个模型', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(3);
    await page.getByRole('button', { name: '模型菜单：DeepSeek V4.1 Flash' }).click();
    await page.getByRole('menuitem', { name: '设为默认', exact: true }).click();
    await expect(
      page.getByTestId('configured-model').filter({ hasText: 'DeepSeek V4.1 Flash' }),
    ).toContainText('默认');
    await page.screenshot({ path: test.info().outputPath('models.png') });
    const configured = await page.evaluate(async () => window.desktop!.models.getSettings());
    if (!configured.ok) throw new Error(configured.error);
    const { models } = configured.value;
    const relay = models.find((m) => m.modelId === 'mock');
    const deepseek = models.find((m) => m.modelId === 'deepseek-flash');
    const beta = models.find((m) => m.modelId === 'beta');
    if (!relay || !deepseek || !beta) throw new Error('Missing configured models');
    expect(JSON.stringify(configured)).not.toContain('deepseek-own-key');
    const savedText = await readFile(file, 'utf8');
    for (const key of ['relay-old-key', 'deepseek-own-key', 'relay-beta-key'])
      expect(savedText).not.toContain(key);
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '聊天模型' })).toHaveValue(deepseek.id);
    const thinking = page.getByRole('combobox', { name: '思考程度' });
    await expect(thinking).toHaveValue('off');
    await expect(thinking.locator('option')).toHaveCount(deepseek.thinkingLevels.length);
    let count = 0;
    for (const [profile, text] of [
      [relay, '第一条'],
      [deepseek, '继续第二条'],
      [beta, '第三条'],
    ] as const) {
      await page.getByRole('combobox', { name: '聊天模型' }).selectOption(profile.id);
      if (profile === deepseek) await thinking.selectOption('high');
      else await expect(thinking).toHaveCount(0);
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
    expect(calls[2]?.body.thinking).not.toEqual({ type: 'disabled' });
    expect(calls[3]?.body).not.toHaveProperty('reasoning_effort');
    expect(JSON.stringify(calls[2]?.body.messages)).toContain('第一条');
    expect(JSON.stringify(calls[3]?.body.messages)).toContain('继续第二条');
    const snapshot = await page.evaluate(async () => window.desktop!.agent.getSnapshot());
    expect(snapshot.ok && snapshot.value.snapshot.sessions).toHaveLength(1);
    expect(snapshot.ok && snapshot.value.snapshot.sessions[0]?.modelId).toBe(beta.id);
    await page.screenshot({ path: test.info().outputPath('chat-model-switch.png') });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(3);
    await page.getByRole('button', { name: '服务商菜单：中转 Beta' }).click();
    await page.getByRole('menuitem', { name: '编辑连接', exact: true }).click();
    await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute(
      'placeholder',
      '已保存，留空保留原 Key',
    );
    await dialog.getByLabel('名称', { exact: true }).fill('Beta 新名称');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('provider-card')).toContainText([
      '旧中转站',
      'DeepSeek',
      'Beta 新名称',
    ]);
    await page.getByRole('button', { name: '模型菜单：beta' }).click();
    await page.getByRole('menuitem', { name: '移除模型', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByTestId('configured-model')).toHaveCount(3);
    await page.getByRole('button', { name: '模型菜单：beta' }).click();
    await page.getByRole('menuitem', { name: '移除模型', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '移除', exact: true }).click();
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
    const bad = await page.evaluate(async () =>
      window.desktop!.models.saveProvider({
        kind: 'builtin',
        sdkProvider: 'not-real',
        apiKey: 'x',
      }),
    );
    expect(bad.ok).toBe(false);
    const imageBlocked = await page.evaluate(async () => {
      const settings = await window.desktop!.models.getSettings();
      if (!settings.ok) throw new Error(settings.error);
      const provider = settings.value.providers.find((p) => p.sdkProvider === 'deepseek');
      if (!provider) throw new Error('Missing DeepSeek');
      const updated = await window.desktop!.models.setProviderModels({
        providerId: provider.id,
        models: [{ modelId: 'deepseek-flash' }, { modelId: 'deepseek-v4-pro' }],
      });
      if (!updated.ok) throw new Error(updated.error);
      const pro = updated.value.models.find((m) => m.modelId === 'deepseek-v4-pro');
      if (!pro) throw new Error('Missing Pro model');
      const bridge = window.desktop!.agent;
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
    await redirectDeepSeek();
    await expect(page.getByRole('combobox', { name: '聊天模型' })).toHaveValue('');
    await expect(page.locator('[data-testid="model-trigger"] option:checked')).toHaveText(
      '选择模型',
    );
    await page.getByRole('combobox', { name: '聊天模型' }).selectOption(deepseek.id);
    await expect(page.getByRole('combobox', { name: '聊天模型' })).toHaveValue(deepseek.id);
    // A new chat starts from the level last used with the model; a draft pick applies on send.
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    const thinkingAgain = page.getByRole('combobox', { name: '思考程度' });
    await expect(thinkingAgain).toHaveValue('high');
    await thinkingAgain.selectOption('off');
    await page.getByLabel('消息', { exact: true }).fill('不要思考');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toHaveCount(1);
    expect(calls[4]?.body.thinking).toEqual({ type: 'disabled' });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

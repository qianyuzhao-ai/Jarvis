import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('homepage Chat: relay setup, SSE, cancellation, history, secrets, theme and isolation', async () => {
  test.setTimeout(60000);
  const requests: Record<string, unknown>[] = [];
  let modelsRequests = 0;
  const server = createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      modelsRequests++;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'mock' }, { id: 'slow' }, { id: 'broken' }] }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    if (req.headers.authorization !== 'Bearer local-test-key') {
      res.writeHead(401);
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const write = (text: string, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'chat_1', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\n\n`,
      );
    write('你好🙂，');
    if (body.model === 'slow') {
      write('\n' + '持续输出的长回复。\n'.repeat(45));
      const timer = setInterval(() => write('后续片段。\n'), 200);
      res.on('close', () => clearInterval(timer));
      return;
    }
    const timer = setTimeout(() => {
      write('这是流式回复。');
      if (body.model !== 'broken') {
        write('', 'stop');
        res.write(
          `data: ${JSON.stringify({ id: 'chat_1', choices: [], usage: { prompt_tokens: 106500, completion_tokens: 100, total_tokens: 106600 } })}\n\n`,
        );
      }
      res.end('data: [DONE]\n\n');
    }, 700);
    res.on('close', () => clearTimeout(timer));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('server');
  const profile = test.info().outputPath('profile');
  const launch = () =>
    electron.launch({
      executablePath: process.env.JARVIS_TEST_EXECUTABLE,
      args: [
        ...(process.env.JARVIS_TEST_EXECUTABLE ? [] : [resolve(import.meta.dirname, '..')]),
        `--user-data-dir=${profile}`,
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
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await expect(page.getByRole('heading', { name: '先添加一个模型' })).toBeVisible();
    await page.getByRole('button', { name: '前往模型设置' }).click();
    await expect(page.getByRole('heading', { name: '模型', exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1800, 1000),
    );
    const settingsPage = page.locator('section[aria-labelledby="models-title"]');
    await expect(settingsPage).toHaveCSS('width', '700px');
    await page.getByRole('button', { name: '添加服务商', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('第 1 步，共 3 步')).toBeVisible();
    await dialog.getByRole('button', { name: /自定义接口/ }).click();
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await dialog.getByLabel('名称', { exact: true }).fill('我的中转站');
    await dialog
      .getByLabel('接口地址', { exact: true })
      .fill(`http://127.0.0.1:${address.port}/v1`);
    await dialog.getByLabel('API Key', { exact: true }).fill('local-test-key');
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('连接成功 · 获取到 3 个模型');
    expect(modelsRequests).toBe(1);
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog.getByTestId('model-option')).toHaveCount(3);
    await expect(dialog.getByTestId('model-option').first()).toContainText('图片未确认');
    await dialog.getByRole('checkbox', { name: '启用 mock' }).click();
    await page.screenshot({ path: test.info().outputPath('add-provider-models.png') });
    await dialog.getByRole('button', { name: '添加 1 个模型', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('configured-model')).toHaveCount(1);
    await page.getByRole('button', { name: '模型菜单：mock' }).click();
    await page.getByRole('menuitem', { name: '模型能力…' }).click();
    await page.getByLabel('上下文容量', { exact: true }).fill('1000000');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('configured-model')).toContainText('1M 上下文');
    const saved = await page.evaluate(() => window.desktop?.models.getSettings());
    expect(saved?.ok && saved.value.providers[0]?.hasKey).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('local-test-key');
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    const stored = await readFile(join(userData, 'agent', 'connection.json'), 'utf8');
    expect(stored).not.toContain('local-test-key');
    await page.screenshot({ path: test.info().outputPath('models-light.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await expect.poll(() => settingsPage.evaluate((n) => n.scrollWidth - n.clientWidth)).toBe(0);
    await page.screenshot({ path: test.info().outputPath('models-compact.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 820));
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    const messageInput = page.getByLabel('消息', { exact: true });
    const dockGap = () =>
      page.evaluate(() => {
        const shell = document.querySelector('[data-testid="chat-page"]')?.getBoundingClientRect();
        const dock = document.querySelector('[data-testid="chat-dock"]')?.getBoundingClientRect();
        return shell && dock ? Math.abs(shell.bottom - dock.bottom) : 999;
      });
    await expect.poll(dockGap).toBeLessThan(2);
    await expect(page.getByTestId('chat-keyboard')).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 1000),
    );
    await messageInput.fill(
      Array.from({ length: 22 }, (_, i) => `第 ${i + 1} 行长输入`).join('\n'),
    );
    await expect.poll(() => messageInput.evaluate((n) => n.clientHeight)).toBe(384);
    expect(await messageInput.evaluate((n) => n.scrollHeight)).toBeGreaterThan(384);
    await expect.poll(dockGap).toBeLessThan(2);
    await page.screenshot({ path: test.info().outputPath('composer-max-lines.png') });
    await messageInput.fill('键盘测试');
    await messageInput.press('Shift+Enter');
    await expect(messageInput).toHaveValue('键盘测试\n');
    const beforeIme = requests.length;
    await messageInput.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(requests.length).toBe(beforeIme);
    await messageInput.fill('');
    await expect.poll(() => messageInput.evaluate((n) => n.clientHeight)).toBe(24);
    await page.screenshot({ path: test.info().outputPath('new-chat-bottom.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 820));
    await page.getByLabel('消息', { exact: true }).fill('本周工作安排');
    await page.getByLabel('消息', { exact: true }).press('Enter');
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"] [data-testid="chat-text"]',
      ),
    ).toHaveText('你好🙂， ▍');
    await expect(page.getByRole('button', { name: '停止回复' })).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toContainText('这是流式回复。');
    await expect(page.getByTestId('chat-speaker')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-reply-meta"] time')).toContainText('刚刚');
    await expect(page.getByTestId('chat-reply-logo')).toBeVisible();
    const userWidth = await page
      .locator('[data-testid="chat-message"][data-message-role="user"]')
      .evaluate((n) => n.getBoundingClientRect().width);
    expect(userWidth).toBeLessThan(300);
    await page.getByRole('button', { name: '上下文占用', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Context 106.6k / 1M (11%)');
    await page.getByRole('button', { name: '上下文占用', exact: true }).click();
    await expect(page.getByRole('button', { name: '上下文占用', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '上下文占用', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.getByRole('button', { name: '复制回复', exact: true }).click();
    await expect(page.getByRole('button', { name: '已复制回复' })).toBeVisible();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      '你好🙂，这是流式回复。',
    );
    await expect.poll(dockGap).toBeLessThan(2);
    const first = await page.evaluate(async () => {
      const r = await window.desktop?.agent.getSnapshot();
      const id = r?.ok ? r.value.snapshot.sessions[0]?.id : undefined;
      const full = id ? await window.desktop?.agent.getSession(id) : undefined;
      return full?.ok ? full.value.session : null;
    });
    expect(first?.title).toBe('本周工作安排');
    const rejectedCopy = await page.evaluate(async (session) => {
      if (!session?.messages[0]) throw new Error('Missing message');
      return window.desktop?.agent.copyReply({
        sessionId: session.id,
        messageId: session.messages[0].id,
      });
    }, first);
    expect(rejectedCopy?.ok).toBe(false);
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      '你好🙂，这是流式回复。',
    );

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '通用', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('models-dark.png') });
    await page
      .getByRole('button', { name: '打开对话：本周工作安排' })
      .count()
      .then(async (count) => {
        if (!count) await page.getByRole('button', { name: '首页', exact: true }).click();
      });
    await page.getByRole('button', { name: '打开对话：本周工作安排' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const historyColor = await page
      .locator('[data-testid="chat-history"] [data-testid="side-link"]')
      .first()
      .evaluate((n) => getComputedStyle(n).color);
    expect(historyColor).not.toBe('rgb(0, 0, 0)');
    await page.screenshot({ path: test.info().outputPath('chat-dark.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    const box = await page.getByTestId('agent-composer').boundingBox();
    const viewport = await page.evaluate(() => innerWidth);
    expect(box && box.x + box.width <= viewport).toBeTruthy();
    await page.screenshot({ path: test.info().outputPath('chat-compact.png') });
    await page.getByRole('button', { name: '重命名对话' }).click();
    await page.getByLabel('对话名称', { exact: true }).fill('已保存的对话');
    await page.getByRole('button', { name: '保存名称' }).click();
    await app.close();
    const index = JSON.parse(await readFile(join(userData, 'agent', 'index.json'), 'utf8'));
    const viewPath = join(userData, 'agent', 'sessions', `${index.sessions[0].meta.id}.view.json`);
    const fixture = JSON.parse(await readFile(viewPath, 'utf8'));
    fixture.messages[1].activities = [
      {
        id: 'fixture-file-edit',
        label: '修改 1 个文件',
        files: [
          {
            path: 'Jarvis/preview.html',
            action: 'edited',
            added: 20,
            removed: 1,
            diff:
              '@@ -1,1 +1,20 @@\n-旧内容\n' +
              Array.from({ length: 20 }, (_, i) => `+<div>第 ${i + 1} 行</div>`).join('\n'),
          },
        ],
      },
    ];
    await writeFile(viewPath, JSON.stringify(fixture));
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toContainText('这是流式回复。');
    await expect(page.getByRole('button', { name: '打开对话：已保存的对话' })).toBeVisible();
    await page.locator('[data-testid="chat-file"] > [data-ui="collapsible-trigger"]').click();
    await expect(page.getByTestId('chat-file-path')).toHaveText('Jarvis/preview.html');
    await expect(page.getByTestId('chat-diff')).toBeVisible();
    expect(
      await page.getByTestId('chat-diff').evaluate((n) => n.scrollHeight > n.clientHeight),
    ).toBe(true);
    await expect(page.locator('[data-testid="chat-diff"] div')).toHaveCount(0);
    await expect(
      page.locator('[data-diff-kind="add"] [data-testid="diff-line-number"]').nth(1),
    ).toHaveText('1');
    await page.screenshot({ path: test.info().outputPath('chat-diff-dark.png') });
    await page.locator('[data-testid="chat-file"] > [data-ui="collapsible-trigger"]').click();
    await expect(page.getByTestId('chat-diff')).not.toBeVisible();
    await page.getByLabel('消息', { exact: true }).fill('继续上次讨论');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toHaveCount(2);
    expect(JSON.stringify(requests.at(-1)?.messages)).toContain('本周工作安排');
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.evaluate(async (model) => {
      const bridge = window.desktop!.models;
      const view = await bridge.getSettings();
      const provider = view.ok ? view.value.providers[0] : undefined;
      if (!view.ok || !provider) throw new Error('Missing configuration');
      const enabled = view.value.models
        .filter((m) => m.providerId === provider.id)
        .map((m) => ({ modelId: m.modelId }));
      const saved = await bridge.setProviderModels({
        providerId: provider.id,
        models: [...enabled, { modelId: model }],
      });
      if (!saved.ok) throw new Error(saved.error);
    }, 'slow');
    await page.reload();
    await page.getByRole('combobox', { name: '聊天模型' }).selectOption({ label: 'slow' });
    await page.getByLabel('消息', { exact: true }).fill('停止验证');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"] [data-testid="chat-text"]',
      ),
    ).toContainText('你好🙂');
    await expect(page.locator('[data-replying="true"]')).toHaveCount(1);
    await page.getByTestId('chat-scroll').evaluate((n) => {
      n.scrollTop = 0;
    });
    await expect(page.getByRole('button', { name: '回到最新' })).toBeVisible();
    const length = (
      await page
        .locator(
          '[data-testid="chat-message"][data-message-role="assistant"] [data-testid="chat-text"]',
        )
        .innerText()
    ).length;
    await expect
      .poll(
        async () =>
          (
            await page
              .locator(
                '[data-testid="chat-message"][data-message-role="assistant"] [data-testid="chat-text"]',
              )
              .innerText()
          ).length,
      )
      .toBeGreaterThan(length);
    expect(await page.getByTestId('chat-scroll').evaluate((n) => n.scrollTop)).toBe(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page
        .locator('[data-replying="true"]')
        .evaluate((n) => getComputedStyle(n).animationName),
    ).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: '停止回复' }).click();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="cancelled"]',
      ),
    ).toContainText('你好🙂');
    const calls = requests.length;
    const invalid = await page.evaluate(async () => {
      const b = window.desktop?.agent;
      return b?.send({
        sessionId: '../not-a-session',
        requestId: crypto.randomUUID(),
        text: 'bad',
      });
    });
    expect(invalid?.ok).toBe(false);
    expect(requests).toHaveLength(calls);
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.evaluate(async (model) => {
      const bridge = window.desktop!.models;
      const view = await bridge.getSettings();
      const provider = view.ok ? view.value.providers[0] : undefined;
      if (!view.ok || !provider) throw new Error('Missing configuration');
      const enabled = view.value.models
        .filter((m) => m.providerId === provider.id)
        .map((m) => ({ modelId: m.modelId }));
      const saved = await bridge.setProviderModels({
        providerId: provider.id,
        models: [...enabled, { modelId: model }],
      });
      if (!saved.ok) throw new Error(saved.error);
    }, 'broken');
    await page.reload();
    await page.getByRole('combobox', { name: '聊天模型' }).selectOption({ label: 'broken' });
    await page.getByLabel('消息', { exact: true }).fill('断流验证');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="failed"]',
      ),
    ).toContainText('你好🙂');
    // Home chat streams and carries only the main Agent's tools for sub-agents, writing
    // documents and navigation; no general file or shell tools.
    const control = [
      'create_document',
      'create_project',
      'delegate_task',
      'list_agents',
      'list_documents',
      'list_writing_folders',
      'message_agent',
      'open_document',
      'open_project',
      'read_agent_transcript',
      'read_document',
      'read_result_card',
      'search_documents',
      'stop_agent',
    ];
    expect(
      requests.every(
        (r) =>
          r.stream === true &&
          JSON.stringify(
            ((r.tools ?? []) as { function: { name: string } }[])
              .map((t) => t.function.name)
              .sort(),
          ) === JSON.stringify(control),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(await readFile(join(userData, 'agent', 'index.json'), 'utf8')).not.toContain(
      'local-test-key',
    );
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

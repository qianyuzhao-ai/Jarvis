import { createServer } from 'node:http';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { newProject } from './helpers/os-ui';

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
    await newProject(page);
    const suggestions = page.locator('.chat-suggestions');
    await expect(suggestions.getByRole('button')).toHaveCount(3);
    const originalTheme = await page.locator('html').getAttribute('data-theme');
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const width of [1280, 900]) {
        await app.evaluate(
          ({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]?.setSize(value, 820),
          width,
        );
        await expect
          .poll(() =>
            suggestions.evaluate((group) => {
              const box = group.getBoundingClientRect();
              const welcome = group.parentElement!.getBoundingClientRect();
              const title = group.querySelector('small')!;
              const titleStart =
                title.getBoundingClientRect().left +
                parseFloat(getComputedStyle(title).paddingLeft);
              const icons = Array.from(
                group.querySelectorAll('button .ui-button-content > svg:first-child'),
              );
              return (
                box.width <= 320 &&
                Math.abs(box.left + box.width / 2 - welcome.left - welcome.width / 2) < 1 &&
                icons.length === 3 &&
                icons.every((icon) => Math.abs(icon.getBoundingClientRect().left - titleStart) < 1)
              );
            }),
          )
          .toBe(true);
        await page.screenshot({
          path: test.info().outputPath(`chat-suggestions-${theme}-${width}.png`),
          animations: 'disabled',
        });
      }
    }
    await page.evaluate((value) => {
      if (value) document.documentElement.dataset.theme = value;
    }, originalTheme);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 820));
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
    const usage = page.getByRole('dialog', { name: '上下文用量', exact: true });
    await expect(usage.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '11');
    await expect(usage).toContainText('Context 106.6k / 1M (11%)');
    await page.screenshot({
      path: test.info().outputPath('context-usage-popover.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(usage).toBeHidden();
    await expect(page.getByRole('button', { name: '上下文占用', exact: true })).toBeFocused();
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
      const r = await window.desktop?.os.getSnapshot();
      const id = r?.ok ? r.value.snapshot.projects[0]?.coordinatorId : undefined;
      const full = id ? await window.desktop?.os.getSession(id) : undefined;
      return full?.ok ? full.value.session : null;
    });
    expect(first?.title).toBe('本周工作安排');
    const rejectedCopy = await page.evaluate(async (session) => {
      if (!session?.messages[0]) throw new Error('Missing message');
      return window.desktop?.os.copyReply({
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
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await expect(page.getByTestId('project-switcher')).toHaveText('本周工作安排');
    await page.getByRole('button', { name: '打开协调对话' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const historyColor = await page
      .getByTestId('side-link')
      .first()
      .evaluate((n) => getComputedStyle(n).color);
    expect(historyColor).not.toBe('rgb(0, 0, 0)');
    await page.screenshot({ path: test.info().outputPath('chat-dark.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    const box = await page.getByTestId('agent-composer').boundingBox();
    const viewport = await page.evaluate(() => innerWidth);
    expect(box && box.x + box.width <= viewport).toBeTruthy();
    await page.screenshot({ path: test.info().outputPath('chat-compact.png') });
    // The conversation's name is its project's, renamed in the project settings.
    await page.getByRole('button', { name: '项目设置' }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('已保存的对话');
    await page.getByRole('button', { name: '保存名称与说明' }).click();
    await expect(page.getByTestId('project-switcher')).toHaveText('已保存的对话');
    await page.getByRole('button', { name: '返回协调对话' }).click();
    await app.close();
    // The conversation is the first project's Coordinator; its log replays message upserts.
    const os = join(userData, 'agent', 'os');
    const registry = JSON.parse(await readFile(join(os, 'projects.json'), 'utf8'));
    const projectDir = join(os, 'projects', registry.projects[0]);
    const { project } = JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'));
    const logPath = join(projectDir, 'sessions', `${project.coordinatorId}.events.jsonl`);
    const latest = new Map<string, { id: string; activities?: unknown[] }>();
    for (const line of (await readFile(logPath, 'utf8')).split('\n').filter(Boolean)) {
      const entry = JSON.parse(line);
      if (entry.t === 'msg') latest.set(entry.m.id, entry.m);
    }
    const reply = [...latest.values()][1];
    if (!reply) throw new Error('Missing reply');
    reply.activities = [
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
    await appendFile(logPath, `${JSON.stringify({ t: 'msg', m: reply })}\n`);
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toContainText('这是流式回复。');
    await expect(page.getByTestId('project-switcher')).toHaveText('已保存的对话');
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
    await newProject(page);
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
      const b = window.desktop?.os;
      return b?.send({
        sessionId: '../not-a-session',
        requestId: crypto.randomUUID(),
        text: 'bad',
      });
    });
    expect(invalid?.ok).toBe(false);
    expect(requests).toHaveLength(calls);
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await newProject(page);
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
    // Home chat is the project's Coordinator: it streams and carries only its read-only tools,
    // thread management and project memory; no write tools and no shell.
    const control = [
      'delete_memory',
      'list_calendars',
      'list_events',
      'list_files',
      'list_folders',
      'list_threads',
      'message_thread',
      'read_memory',
      'read_thread',
      'search_files',
      'spawn_thread',
      'stop_thread',
      'write_memory',
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
    expect(await readFile(logPath, 'utf8')).not.toContain('local-test-key');
    expect(await readFile(join(userData, 'agent', 'connection.json'), 'utf8')).not.toContain(
      'local-test-key',
    );
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

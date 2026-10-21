import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
    if (body.model === 'slow') return;
    const timer = setTimeout(() => {
      write('这是流式回复。');
      if (body.model !== 'broken') write('', 'stop');
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
    await expect(page.getByRole('heading', { name: '先连接你的中转站' })).toBeVisible();
    await page.getByRole('button', { name: '配置模型服务' }).click();
    await page.getByLabel('API 地址', { exact: true }).fill(`http://127.0.0.1:${address.port}/v1`);
    await page.getByLabel('API Key', { exact: true }).fill('local-test-key');
    await page.getByRole('button', { name: '获取模型', exact: true }).click();
    await expect.poll(() => modelsRequests).toBe(1);
    await page.getByLabel('默认模型', { exact: true }).fill('mock');
    await page.locator('.relay-advanced summary').click();
    await page.getByLabel('上下文容量', { exact: true }).fill('8192');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '连接成功' })).toBeVisible();
    await expect(page.locator('.relay-footer > span')).toHaveText('更改尚未保存');
    await page.getByRole('button', { name: '保存更改', exact: true }).click();
    await expect(page.locator('.relay-footer > span')).toHaveText('配置已保存');
    const saved = await page.evaluate(() => window.desktop?.agent.getConfiguration());
    expect(saved?.ok && saved.value.hasKey).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('local-test-key');
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    const stored = await readFile(join(userData, 'agent', 'connection.json'), 'utf8');
    expect(stored).not.toContain('local-test-key');
    await page.screenshot({ path: test.info().outputPath('relay-light.png') });
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('本周工作安排');
    await page.getByLabel('消息', { exact: true }).press('Enter');
    await expect(page.locator('.chat-message.assistant .chat-text')).toHaveText('你好🙂， ▍');
    await expect(page.getByRole('button', { name: '停止回复' })).toBeVisible();
    await expect(page.locator('.chat-message.assistant[data-status="succeeded"]')).toContainText(
      '这是流式回复。',
    );
    await expect(page.getByRole('button', { name: '上下文占用', exact: true })).toHaveAttribute(
      'title',
      '上下文占用未知',
    );
    const first = await page.evaluate(async () => {
      const r = await window.desktop?.agent.getSnapshot();
      return r?.ok ? r.value.snapshot.sessions[0] : null;
    });
    expect(first?.title).toBe('本周工作安排');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: '模型服务', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('relay-dark.png') });
    await page
      .getByRole('button', { name: '打开对话：本周工作安排' })
      .count()
      .then(async (count) => {
        if (!count) await page.getByRole('button', { name: '返回工作台' }).click();
      });
    await page.getByRole('button', { name: '打开对话：本周工作安排' }).click();
    await expect(page.locator('.theme-root')).toHaveAttribute('data-theme', 'dark');
    const historyColor = await page
      .locator('.chat-history .side-link')
      .first()
      .evaluate((n) => getComputedStyle(n).color);
    expect(historyColor).not.toBe('rgb(0, 0, 0)');
    await page.screenshot({ path: test.info().outputPath('chat-dark.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    const box = await page.locator('.agent-composer').boundingBox();
    const viewport = await page.evaluate(() => innerWidth);
    expect(box && box.x + box.width <= viewport).toBeTruthy();
    await page.screenshot({ path: test.info().outputPath('chat-compact.png') });
    await page.getByRole('button', { name: '重命名对话' }).click();
    await page.getByLabel('对话名称', { exact: true }).fill('已保存的对话');
    await page.getByRole('button', { name: '保存名称' }).click();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('.chat-message.assistant[data-status="succeeded"]')).toContainText(
      '这是流式回复。',
    );
    await expect(page.getByRole('button', { name: '打开对话：已保存的对话' })).toBeVisible();
    await page.getByLabel('消息', { exact: true }).fill('继续上次讨论');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.chat-message.assistant[data-status="succeeded"]')).toHaveCount(2);
    expect(JSON.stringify(requests.at(-1)?.messages)).toContain('本周工作安排');
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.locator('.model-trigger').click();
    await page.getByLabel('模型 ID', { exact: true }).fill('slow');
    await page.getByRole('button', { name: '使用此模型' }).click();
    await page.getByLabel('消息', { exact: true }).fill('停止验证');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.chat-message.assistant .chat-text')).toContainText('你好🙂');
    await page.getByRole('button', { name: '停止回复' }).click();
    await expect(page.locator('.chat-message.assistant[data-status="cancelled"]')).toContainText(
      '你好🙂',
    );
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
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.locator('.model-trigger').click();
    await page.getByLabel('模型 ID', { exact: true }).fill('broken');
    await page.getByRole('button', { name: '使用此模型' }).click();
    await page.getByLabel('消息', { exact: true }).fill('断流验证');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.chat-message.assistant[data-status="failed"]')).toContainText(
      '你好🙂',
    );
    expect(
      requests.every((r) => r.stream === true && (!r.tools || (r.tools as unknown[]).length === 0)),
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

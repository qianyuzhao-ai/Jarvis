import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import type { WorkspaceData } from '../src/renderer/src/features/creation/types';

async function workspace(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('jarvis-workspace', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<WorkspaceData>((resolve) => {
        const r = db.transaction('workspace').objectStore('workspace').get('current');
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
test('canvas sidebar reads selection, applies and undoes grouped edits, restores project conversations and keeps tools scoped', async () => {
  test.setTimeout(60000);
  const calls: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(body);
    const messages = body.messages as { role: string; content: string }[];
    const userIndex = messages.findLastIndex((m) => m.role === 'user');
    const prompt = JSON.stringify(messages[userIndex]?.content ?? '');
    const tools = messages.slice(userIndex + 1).filter((m) => m.role === 'tool');
    const step = tools.length;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const write = (delta: unknown, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'canvas-ui', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    if (prompt.includes('持续等待')) {
      write({ content: '正在分析这张画布。' });
      return;
    }
    const overview = tools[0] ? JSON.parse(tools[0].content) : null;
    const source = overview?.nodes[0]?.id;
    const names = [
      'get_canvas_summary',
      'get_node_details',
      'edit_canvas',
      'edit_canvas',
      'focus_nodes',
    ];
    if (step < names.length) {
      const args =
        step === 0
          ? {}
          : step === 1
            ? { nodeIds: [source] }
            : step === 2
              ? {
                  operations: [
                    {
                      kind: 'update_node',
                      nodeId: source,
                      patch: { prompt: 'Agent 新提示词', name: '开场画面' },
                    },
                    {
                      kind: 'create_node',
                      nodeId: 'agent-video',
                      media: 'video',
                      x: 600,
                      y: 100,
                      patch: { name: '成片视频' },
                    },
                    { kind: 'connect', source, target: 'agent-video' },
                  ],
                }
              : step === 3
                ? { operations: [{ kind: 'move_node', nodeId: 'agent-video', x: 600, y: 300 }] }
                : { nodeIds: ['agent-video'] };
      write({
        tool_calls: [
          {
            index: 0,
            id: `call-${step}`,
            type: 'function',
            function: { name: names[step], arguments: JSON.stringify(args) },
          },
        ],
      });
      write({}, 'tool_calls');
    } else {
      write({ content: '已创建视频节点、修改提示词并连接。可以撤销本次修改。' });
      write({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Missing server');
  const profile = test.info().outputPath('profile');
  const launch = () =>
    electron.launch({
      args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
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
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    const saved = await page.evaluate(
      async (baseUrl) =>
        window.desktop?.agent.saveConfiguration({
          config: {
            name: 'Canvas mock',
            baseUrl,
            api: 'openai-completions',
            model: 'mock',
            contextWindow: 1000000,
            maxTokens: 4096,
          },
          apiKey: 'mock-key',
          clearKey: false,
        }),
      `http://127.0.0.1:${addr.port}/v1`,
    );
    expect(saved?.ok).toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('画布 Agent 项目');
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await page.locator('.react-flow__node-media').click();
    await page.getByRole('button', { name: '展开画布助手', exact: true }).click();
    let sidebar = page.getByRole('complementary', { name: '画布助手' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '新聊天',
    );
    await expect(sidebar.getByRole('button', { name: '新建画布对话' })).toHaveText('新聊天');
    await expect(sidebar.getByRole('button', { name: '收起画布助手' })).toHaveCount(0);
    await expect(sidebar.getByTestId('canvas-context-scope')).toContainText('1 个选中节点');
    await sidebar.getByLabel('消息', { exact: true }).fill('修改提示词，创建和连接视频节点');
    await sidebar.getByRole('button', { name: '发送消息' }).click();
    await expect(
      sidebar.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toContainText('已创建视频节点');
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '修改提示词，创建和连接视频节点',
    );
    const graph = (await workspace(page)).projects[0];
    expect(graph?.nodes).toHaveLength(2);
    expect(graph?.edges).toHaveLength(1);
    expect(graph?.agentEdits).toHaveLength(1);
    expect(graph?.nodes.find((n) => n.id === 'agent-video')?.position.y).toBe(300);
    await expect(sidebar.getByTestId('canvas-message-references')).toContainText('图像生成');
    await sidebar
      .locator('[data-testid="canvas-change-details"] > [data-ui="collapsible-trigger"]')
      .first()
      .click();
    await expect(
      sidebar
        .locator('[data-testid="canvas-change-details"] ins')
        .filter({ hasText: 'Agent 新提示词' }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('canvas-agent-changes.png') });
    await sidebar
      .locator('[data-testid="canvas-change-details"] > [data-ui="collapsible-trigger"]')
      .first()
      .click();
    const current = await page.evaluate(async () => window.desktop?.agent.getSnapshot());
    const sessionId = current?.ok
      ? current.value.snapshot.sessions.find((s) => s.projectId)?.id
      : undefined;
    if (!sessionId) throw new Error('Missing canvas session');
    const rejected = await page.evaluate(async (id) => {
      const bridge = window.desktop?.agent;
      return [
        await bridge?.send({
          sessionId: id,
          requestId: crypto.randomUUID(),
          text: 'missing scope',
        }),
        await bridge?.send({
          sessionId: id,
          requestId: crypto.randomUUID(),
          text: 'wrong project',
          canvas: {
            projectId: crypto.randomUUID(),
            name: 'other',
            revision: 'x',
            selectedIds: [],
            nodes: [],
            edges: [],
          },
        }),
      ];
    }, sessionId);
    expect(rejected.every((r) => r?.ok === false)).toBe(true);
    await page.getByRole('separator', { name: '调整画布助手宽度' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(410);
    await page.screenshot({ path: test.info().outputPath('canvas-agent-light.png') });
    await sidebar.getByRole('button', { name: '撤销本次修改' }).last().click();
    await expect.poll(async () => (await workspace(page)).projects[0]?.nodes.length).toBe(1);
    expect((await workspace(page)).projects[0]?.edges).toHaveLength(0);
    await sidebar.getByRole('button', { name: '新建画布对话' }).click();
    await sidebar.getByLabel('消息', { exact: true }).fill('持续等待');
    await sidebar.getByRole('button', { name: '发送消息' }).click();
    await expect(sidebar.locator('[data-replying="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: '收起画布助手', exact: true }).click();
    await expect(sidebar).toBeHidden();
    const running = await page.evaluate(async () => window.desktop?.agent.getSnapshot());
    expect(running?.ok && running.value.snapshot.busySessionId).toBeTruthy();
    await page.getByRole('button', { name: '展开画布助手', exact: true }).click();
    await sidebar.getByRole('button', { name: '停止回复' }).click();
    await expect(
      sidebar.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="cancelled"]',
      ),
    ).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    const bounds = await sidebar.boundingBox();
    expect(bounds?.width).toBeLessThanOrEqual(540);
    await page.screenshot({ path: test.info().outputPath('canvas-agent-compact.png') });
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await expect(page.getByRole('log', { name: '画布对话消息' })).toHaveCount(0);
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.getByTestId('project-row').filter({ hasText: '画布 Agent 项目' }).click();
    await page.getByRole('button', { name: '画布对话历史' }).click();
    await page
      .getByRole('navigation', { name: '当前项目对话' })
      .getByRole('button')
      .first()
      .click();
    await expect(
      page.locator('[data-testid="canvas-agent"] [data-testid="chat-message"]'),
    ).not.toHaveCount(0);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    sidebar = page.getByRole('complementary', { name: '画布助手' });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByTestId('project-row').filter({ hasText: '画布 Agent 项目' }).click();
    await expect(
      page.locator('[data-testid="canvas-agent"] [data-testid="chat-message"]'),
    ).not.toHaveCount(0);
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByTestId('project-row').filter({ hasText: '画布 Agent 项目' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('canvas-agent-dark.png') });
    await sidebar.getByLabel('消息', { exact: true }).fill('保留的聊天草稿');
    await page.getByRole('button', { name: '画布对话历史' }).click();
    const history = page.getByRole('navigation', { name: '当前项目对话' });
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '历史对话',
    );
    await expect(sidebar.getByLabel('消息', { exact: true })).toBeHidden();
    await expect(sidebar.getByRole('log', { name: '画布对话消息' })).toHaveCount(0);
    await expect(history.locator('time')).toHaveCount(2);
    const times = await history
      .locator('time')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('datetime')));
    expect(times.every((value) => value && Number.isFinite(Date.parse(value)))).toBe(true);
    expect(Date.parse(times[0]!)).toBeGreaterThanOrEqual(Date.parse(times[1]!));
    const record = await page.evaluate(async () => window.desktop?.agent.getSnapshot());
    const targetTitle = await history
      .locator('[data-testid="canvas-conversation-summary"] > span')
      .first()
      .textContent();
    const deletedId = record?.ok
      ? record.value.snapshot.sessions.find((s) => s.projectId && s.title === targetTitle)?.id
      : undefined;
    if (!deletedId) throw new Error('Missing history session');
    await history
      .getByRole('button', { name: /^重命名画布对话：/ })
      .first()
      .click();
    await page.getByLabel('画布对话名称', { exact: true }).fill('已重命名的画布会话');
    await history.getByRole('button', { name: '保存', exact: true }).click();
    await expect(history).toContainText('已重命名的画布会话');
    await page.screenshot({ path: test.info().outputPath('canvas-agent-history.png') });
    await sidebar.getByRole('button', { name: '返回当前聊天' }).click();
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '已重命名的画布会话',
    );
    await expect(sidebar.getByLabel('消息', { exact: true })).toHaveValue('保留的聊天草稿');
    await expect(history).toHaveCount(0);
    await page.getByRole('button', { name: '画布对话历史' }).click();
    const count = await history.getByTestId('canvas-conversation-row').count();
    await history.getByRole('button', { name: '删除画布对话：已重命名的画布会话' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(history.getByTestId('canvas-conversation-row')).toHaveCount(count);
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    await expect(
      readFile(resolve(userData, 'agent', 'sessions', deletedId + '.jsonl')),
    ).resolves.toBeDefined();
    await history.getByRole('button', { name: '删除画布对话：已重命名的画布会话' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '删除对话', exact: true })
      .click();
    await expect(history.getByTestId('canvas-conversation-row')).toHaveCount(count - 1);
    await expect(
      readFile(resolve(userData, 'agent', 'sessions', deletedId + '.jsonl')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await sidebar.getByRole('button', { name: '新建画布对话' }).click();
    await expect(history).toHaveCount(0);
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '新聊天',
    );
    await expect(sidebar.getByLabel('消息', { exact: true })).toBeVisible();
    expect(
      (await workspace(page)).projects.find((p) => p.name === '画布 Agent 项目')?.nodes,
    ).toHaveLength(1);
    expect(calls.some((c) => JSON.stringify(c.tools).includes('edit_canvas'))).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

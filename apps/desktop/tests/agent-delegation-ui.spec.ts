import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import type { WorkspaceData } from '../src/renderer/src/features/creation/types';
import { addRelayModel } from './helpers/model-setup';

type Message = { role: string; content: unknown };

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

test('the home Agent delegates to a project open in a tab, which edits it and reports back', async () => {
  test.setTimeout(90000);
  const toolResults: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body: { messages: Message[] } = JSON.parse(Buffer.concat(chunks).toString());
    const userIndex = body.messages.findLastIndex((m) => m.role === 'user');
    const prompt = JSON.stringify(body.messages[userIndex]?.content);
    const tools = body.messages.slice(userIndex + 1).filter((m) => m.role === 'tool');
    const results = tools.map((m) =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    );
    toolResults.push(...results.slice(-1));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const call = (name: string, args: unknown) =>
      res.end(
        chunk({
          tool_calls: [
            {
              index: 0,
              id: randomUUID(),
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        }) +
          chunk({}, 'tool_calls') +
          'data: [DONE]\n\n',
      );
    const text = (content: string) =>
      res.end(chunk({ content }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
    if (prompt.includes('委派任务状态通知')) return text('分镜项目已完成：节点改名为分镜一。');
    if (prompt.includes('Jarvis 主 Agent 委派的任务')) {
      const summary = results[0] ? JSON.parse(results[0]) : null;
      const node = summary?.nodes?.[0]?.id;
      const steps: [string, unknown][] = [
        ['get_canvas_summary', {}],
        ['get_node_details', { nodeIds: [node] }],
        [
          'edit_canvas',
          { operations: [{ kind: 'update_node', nodeId: node, patch: { name: '分镜一' } }] },
        ],
        [
          'report_result',
          {
            status: 'done',
            summary: '已把节点改名为分镜一',
            artifacts: [{ kind: 'node', ref: node }],
          },
        ],
      ];
      const step = steps[tools.length];
      return step ? call(...step) : text('分镜已排好');
    }
    if (prompt.includes('去项目排分镜')) {
      const listed = results[0] ? JSON.parse(results[0]) : null;
      if (tools.length === 0) return call('list_agents', {});
      if (tools.length === 1)
        return call('delegate_task', {
          target: { projectId: listed.openProjects[0].id },
          task: '排三格分镜',
        });
      if (tools.length === 2)
        return call('delegate_task', { target: { projectId: randomUUID() }, task: '排分镜' });
      return text('已交给分镜项目的画布助手。');
    }
    text('好的');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const app = await electron.launch({
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
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' });
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('分镜项目');
    await page.getByRole('button', { name: '图像', exact: true }).click();
    await expect(page.locator('.react-flow__node-media')).toHaveCount(1);

    // The project stays in its tab while the user talks to Jarvis at home.
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('去项目排分镜');
    await page.getByRole('button', { name: '发送消息' }).click();
    const notice = page
      .locator('[data-testid="chat-message"][data-message-role="user"]')
      .filter({ hasText: '画布任务「排三格分镜」已完成' });
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice.getByTestId('chat-relay')).toHaveText('空间任务状态 · 排三格分镜');
    await expect(page.getByText('分镜项目已完成：节点改名为分镜一。')).toBeVisible();
    expect(toolResults.some((r) => r.includes('没有在任何窗口中打开'))).toBe(true);
    await expect
      .poll(async () => (await workspace(page)).projects[0]?.nodes[0]?.data.name)
      .toBe('分镜一');
    const card = page
      .getByTestId('space-cards')
      .getByRole('button', { name: '打开空间任务：排三格分镜' });
    await expect(card).toContainText('已完成');
    await page.screenshot({ path: test.info().outputPath('delegation-home.png') });

    // The delegated conversation sits in the project's assistant with the task marked as Jarvis's.
    await card.click();
    const sidebar = page.getByRole('complementary', { name: '画布助手' });
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '排三格分镜',
    );
    await expect(sidebar.getByTestId('chat-relay')).toContainText('Jarvis 委派 · ');
    await expect(sidebar.getByText('分镜已排好')).toBeVisible();
    // Let the panel finish sliding in before the screenshot.
    await expect
      .poll(async () => {
        const box = await sidebar.boundingBox();
        return box ? Math.round(box.x + box.width) : 9999;
      })
      .toBeLessThanOrEqual(page.viewportSize()?.width ?? 1280);
    await page.screenshot({ path: test.info().outputPath('delegation-canvas.png') });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';

test('home lists space task cards and opening one returns to its space and conversation', async () => {
  test.setTimeout(60000);
  const server = createServer(async (req, res) => {
    for await (const _ of req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(chunk({ content: '分镜节点已排好' }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
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
    await page.getByLabel('项目名称', { exact: true }).fill('卡片项目');
    await page.getByRole('button', { name: '展开画布助手', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: '画布助手' });
    await sidebar.getByLabel('消息', { exact: true }).fill('排一版分镜');
    await sidebar.getByRole('button', { name: '发送消息' }).click();
    await expect(
      sidebar.locator(
        '[data-testid="chat-message"][data-message-role="assistant"][data-status="succeeded"]',
      ),
    ).toContainText('分镜节点已排好');
    // Move to a fresh conversation so opening the card has to switch back.
    await sidebar.getByRole('button', { name: '新建画布对话' }).click();
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '新聊天',
    );

    await page.getByRole('button', { name: '首页', exact: true }).click();
    const cards = page.getByTestId('space-cards');
    const card = cards.getByRole('button', { name: '打开空间任务：排一版分镜' });
    await expect(card).toContainText('已完成');
    await expect(card).toHaveAttribute('title', '分镜节点已排好');
    // Space conversations stay out of the home chat history.
    await expect(page.getByTestId('chat-history')).not.toContainText('排一版分镜');
    await page.screenshot({ path: test.info().outputPath('space-cards.png') });

    await card.click();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('[data-testid="canvas-agent-header"] strong')).toHaveText(
      '排一版分镜',
    );
    await expect(sidebar.getByText('分镜节点已排好')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

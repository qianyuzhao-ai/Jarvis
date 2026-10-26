import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { newProject } from './helpers/os-ui';

test('the concurrency setting in General persists and makes extra conversations wait', async () => {
  const held: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    for await (const _part of req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': open\n\n');
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    held.push(() => res.end(chunk({ content: '好' }) + chunk({}, 'stop') + 'data: [DONE]\n\n'));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
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
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '通用', exact: true }).click();
    const setting = page.getByRole('combobox', { name: '同时运行的 Agent 数' });
    await expect(setting).toHaveValue('3');
    await setting.selectOption('1');
    await expect(page.getByText('已保存，新的回复按此上限排队')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('concurrency-setting.png') });
    await app.close();

    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '通用', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '同时运行的 Agent 数' })).toHaveValue('1');

    await page.getByRole('button', { name: '首页', exact: true }).click();
    const input = page.getByLabel('消息', { exact: true });
    await input.fill('第一个对话');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect.poll(() => held.length).toBe(1);
    await newProject(page);
    await input.fill('第二个对话');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.getByText('等待中：同时回复的对话已达上限')).toBeVisible();
    await new Promise((r) => setTimeout(r, 300));
    expect(held).toHaveLength(1);
    held.shift()?.();
    await expect.poll(() => held.length).toBe(1);
    held.shift()?.();
    await expect(page.getByText('等待中：同时回复的对话已达上限')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-message"]').last()).toContainText('好');
  } finally {
    for (const release of held.splice(0)) release();
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

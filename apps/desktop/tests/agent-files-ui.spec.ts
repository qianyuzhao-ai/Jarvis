import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';

test('a folder authorized in settings lets Jarvis overwrite a file after approval, and the round undoes', async () => {
  test.setTimeout(60000);
  const folder = test.info().outputPath('素材');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, '待办.txt'), '一、买菜');
  let folderId = '';
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const userIndex = body.messages.findLastIndex((m: { role: string }) => m.role === 'user');
    const results = body.messages
      .slice(userIndex + 1)
      .filter((m: { role: string }) => m.role === 'tool');
    if (results[0]) folderId = JSON.parse(results[0].content).folders[0]?.folderId ?? '';
    const steps: [string, unknown][] = [
      ['list_folders', {}],
      ['overwrite_file', { folderId, path: '待办.txt', content: '一、买菜\n二、取快递' }],
    ];
    const next = steps[results.length];
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      (next
        ? chunk({
            tool_calls: [
              {
                index: 0,
                id: randomUUID(),
                type: 'function',
                function: { name: next[0], arguments: JSON.stringify(next[1]) },
              },
            ],
          }) + chunk({}, 'tool_calls')
        : chunk({ content: '待办已更新。' }) + chunk({}, 'stop')) + 'data: [DONE]\n\n',
    );
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

    // Authorize the folder in Settings › 文件与权限.
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, folder);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByTestId('side-link').filter({ hasText: '文件与权限' }).click();
    await expect(page.getByTestId('folder-empty')).toBeVisible();
    await page.getByRole('button', { name: '添加文件夹' }).click();
    await expect(page.getByTestId('folder-row')).toContainText('素材');
    await page.screenshot({ path: test.info().outputPath('file-access.png') });

    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('在待办里加上取快递');
    await page.getByRole('button', { name: '发送消息' }).click();
    const approval = page.getByRole('alertdialog');
    await expect(approval).toContainText('素材/待办.txt');
    await expect(approval).toContainText('二、取快递');
    await page.screenshot({ path: test.info().outputPath('file-approval.png') });
    await approval.getByRole('button', { name: '允许' }).click();
    await expect(page.getByText('待办已更新。')).toBeVisible();
    expect(await readFile(join(folder, '待办.txt'), 'utf8')).toBe('一、买菜\n二、取快递');
    await expect(page.getByTestId('chat-file')).toContainText('修改');

    await page.getByRole('button', { name: '撤销本轮文件修改' }).click();
    await expect(page.getByRole('button', { name: '本轮文件修改已撤销' })).toBeDisabled();
    expect(await readFile(join(folder, '待办.txt'), 'utf8')).toBe('一、买菜');

    // Removing the authorization takes the folder away from Jarvis.
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByTestId('side-link').filter({ hasText: '文件与权限' }).click();
    await page.getByRole('button', { name: '移除授权：素材' }).click();
    await expect(page.getByTestId('folder-empty')).toBeVisible();
    expect(await page.evaluate(async () => (await window.desktop!.agent.listFolders()).ok)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { osRelay } from './helpers/os-relay';
import { approveInOverview, newProject, openActivities, projectMenu } from './helpers/os-ui';

test('a folder authorized in settings lets Jarvis overwrite a file after approval, and the round undoes', async () => {
  test.setTimeout(60000);
  const folder = test.info().outputPath('素材');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, '待办.txt'), '一、买菜');
  let folderId = '';
  const { server, url } = await osRelay({
    title: '整理待办',
    capabilities: ['files'],
    steps: [
      () => ['list_folders', {}],
      (results) => {
        folderId ||=
          JSON.parse(results[0] ?? '{}').folders?.find((f: { name: string }) => f.name === '素材')
            ?.folderId ?? '';
        return ['overwrite_file', { folderId, path: '待办.txt', content: '一、买菜\n二、取快递' }];
      },
    ],
    done: '待办已更新。',
  });
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
    await addRelayModel(page, { baseUrl: url, model: 'mock' });
    await page.reload();

    // Give the project the folder in its settings.
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, folder);
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await newProject(page);
    const settings = () => projectMenu(page, '项目设置');
    await settings();
    // The project's own library folder is always there; the added folder joins it.
    await expect(page.getByTestId('folder-row')).toHaveCount(1);
    await page.getByRole('button', { name: '添加文件夹' }).click();
    await expect(page.getByTestId('folder-row').filter({ hasText: '素材' })).toHaveCount(1);
    await expect(page.getByTestId('folder-row').filter({ hasText: '项目文件' })).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath('file-access.png') });

    await page.getByRole('button', { name: '返回 Jarvis Chat' }).click();
    await page.getByLabel('消息', { exact: true }).fill('在待办里加上取快递');
    await page.getByRole('button', { name: '发送消息' }).click();
    await approveInOverview(
      page,
      ['素材/待办.txt', '二、取快递'],
      test.info().outputPath('file-approval.png'),
    );
    await expect(page.getByText('待办已更新。')).toBeVisible();
    expect(await readFile(join(folder, '待办.txt'), 'utf8')).toBe('一、买菜\n二、取快递');
    // The thread made the change; its conversation carries the change and its undo.
    await page.getByTestId('thread-card').filter({ hasText: '整理待办' }).click();
    await expect(page.getByTestId('chat-file')).toContainText('修改');

    await openActivities(page);
    await page.getByRole('button', { name: '撤销本轮文件修改' }).click();
    await expect(page.getByRole('button', { name: '本轮文件修改已撤销' })).toBeDisabled();
    expect(await readFile(join(folder, '待办.txt'), 'utf8')).toBe('一、买菜');

    // Removing the folder takes it away from the project.
    await settings();
    await page.getByRole('button', { name: '移除目录：素材' }).click();
    await expect(page.getByTestId('folder-row').filter({ hasText: '素材' })).toHaveCount(0);
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

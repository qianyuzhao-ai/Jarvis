import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { osRelay } from './helpers/os-relay';
import { newProject, projectMenu } from './helpers/os-ui';

test('a project shows its threads, Overview, decision questions and settings', async () => {
  test.setTimeout(90000);
  const { server, url } = await osRelay({
    title: '整理周报',
    capabilities: [],
    steps: [
      () => [
        'ask_user',
        {
          question: '周报写给谁？',
          options: [
            { label: '团队', consequence: '语气轻松，列出每人进展' },
            { label: '管理层', consequence: '只写结论和风险' },
          ],
          recommended: 0,
          reason: '受众决定写法',
        },
      ],
      () => [
        'update_checklist',
        {
          items: [
            { text: '读取本周资料', status: 'done' },
            { text: '写成周报', status: 'doing' },
          ],
        },
      ],
    ],
    done: '周报草稿已写好。',
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
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 820));

    // The first message starts a project; the Coordinator hands the work to a thread.
    await page.getByLabel('消息', { exact: true }).fill('帮我写本周周报');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.getByTestId('project-switcher')).toHaveText('帮我写本周周报');
    await expect(page.getByTestId('coordinator-header')).toBeVisible();
    const card = page.getByTestId('thread-card').filter({ hasText: '整理周报' });
    await expect(card).toBeVisible();
    await expect(page.getByTestId('thread-notice')).toContainText('整理周报');
    await expect(page.getByText('周报草稿已写好。').last()).toBeVisible();
    await expect(page.getByTestId('thread-link').filter({ hasText: '整理周报' })).toBeVisible();
    await expect(page.getByTestId('overview-link')).toContainText('1 件等你');
    await expect(card).toContainText('等你决定');
    await page.screenshot({ path: test.info().outputPath('coordinator.png') });

    // The Overview puts the question first; it is answered in the thread.
    await page.getByTestId('overview-link').click();
    const question = page.getByTestId('overview-question');
    await expect(question).toContainText('周报写给谁？');
    await expect(question).toContainText('推荐「团队」');
    await page.screenshot({ path: test.info().outputPath('overview.png') });
    await question.getByRole('button', { name: '去回答' }).click();
    await expect(page.getByTestId('thread-header')).toContainText('整理周报');
    await expect(page.getByTestId('thread-checklist')).toContainText('1 / 2');
    const decision = page.getByTestId('decision-card');
    await expect(decision).toContainText('语气轻松，列出每人进展');
    await page.screenshot({ path: test.info().outputPath('thread.png') });
    await decision.getByRole('button', { name: '团队', exact: true }).click();
    await expect(decision).toHaveCount(0);
    await expect(page.getByTestId('overview-link')).not.toContainText('件等你');

    // A clicked system notification opens its conversation in this window.
    const threadId = await page.evaluate(async () => {
      const r = await window.desktop!.os.getSnapshot();
      return r.ok ? r.value.snapshot.threads[0]?.id : undefined;
    });
    await page.getByTestId('overview-link').click();
    await expect(page.getByTestId('overview')).toBeVisible();
    await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]?.webContents.send('os:open', id),
      threadId,
    );
    await expect(page.getByTestId('thread-header')).toContainText('整理周报');

    // Project settings: the project's own folder, empty memory, and renaming.
    await projectMenu(page, '项目设置');
    const settings = page.getByTestId('project-settings');
    await expect(settings.getByTestId('folder-row')).toHaveCount(1);
    await expect(settings.getByTestId('folder-row')).toContainText('项目文件');
    await expect(settings).toContainText('还没有记忆。');
    await page.getByLabel('项目名称', { exact: true }).fill('周报与日程');
    await page.getByRole('button', { name: '保存名称与说明' }).click();
    await expect(page.getByTestId('project-switcher')).toHaveText('周报与日程');
    await page.screenshot({ path: test.info().outputPath('project-settings.png') });

    // A second project from the menu starts empty and keeps the first one's threads apart.
    await newProject(page);
    await expect(page.getByTestId('thread-link')).toHaveCount(0);
    await projectMenu(page, '周报与日程');
    await expect(page.getByTestId('thread-link')).toHaveCount(1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: test.info().outputPath('coordinator-dark.png') });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

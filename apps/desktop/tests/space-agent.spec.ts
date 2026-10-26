import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { call, mockModel, promptOf, toolResults, type MockReply } from './helpers/os';

const isCoordinator = (system: string) => system.includes('协调者（Coordinator）');
function launch(profile: string) {
  return electron.launch({
    args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
}

test('the canvas sidebar is the thread bound to the canvas: edits, undo, a written answer, history and the home view', async () => {
  test.setTimeout(90000);
  const server = await mockModel((body, step): MockReply => {
    const { system, user } = promptOf(body);
    if (isCoordinator(system)) return { text: '好的。' };
    if (user.includes('决策结果')) return { text: '按你的答案：方形。' };
    if (step === 0) return call('get_canvas_summary', {});
    if (step === 1)
      return call('edit_canvas', {
        operations: [
          {
            kind: 'create_node',
            nodeId: 'warm-1',
            media: 'image',
            x: 0,
            y: 0,
            patch: { prompt: '暖色调的海边日落' },
          },
        ],
      });
    if (step === 2)
      return call('ask_user', {
        question: '视频用 16:9 还是 9:16？',
        options: [
          { label: '16:9', consequence: '与图片一致' },
          { label: '9:16', consequence: '适合手机竖屏' },
        ],
        recommended: 0,
      });
    return { text: '改好了。' };
  });
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: server.url, model: 'mock' });
    await page.reload();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建画布', exact: true }).click();
    await page.getByLabel('画布名称', { exact: true }).fill('视觉系统');
    const nodes = page.locator('.react-flow__node');
    const before = await nodes.count();
    await page.getByRole('button', { name: '展开画布助手', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: '画布助手' });
    await expect(sidebar).toContainText('对这张画布说要做什么');
    // The sidebar is too narrow for the skills button; / still opens the list.
    await expect(sidebar.locator('.composer-skills')).toHaveCount(0);
    await sidebar.getByLabel('消息', { exact: true }).fill('把提示词改成暖色调');
    await sidebar.getByRole('button', { name: '发送消息' }).click();
    await expect(sidebar.getByText('改好了。')).toBeVisible();
    const header = page.getByTestId('space-thread-header');
    await expect(header).toContainText('把提示词改成暖色调');
    await expect(sidebar).toContainText('线程 · 我的项目');
    await expect(sidebar).toContainText('已应用画布修改');
    await expect(nodes).toHaveCount(before + 1);
    // A question is answered on its compact card, here with the user's own words.
    const card = sidebar.getByTestId('decision-card');
    await expect(card).toContainText('视频用 16:9 还是 9:16？');
    await expect(card).toContainText('推荐「16:9」');
    await page.screenshot({ path: test.info().outputPath('canvas-thread.png') });
    await card.getByLabel('其他答案', { exact: true }).fill('都不要，用方形');
    await card.getByRole('button', { name: '回答', exact: true }).click();
    await expect(sidebar.getByText('按你的答案：方形。')).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(JSON.stringify(server.bodies.at(-1)?.messages)).toContain('都不要，用方形');
    // The round's canvas edit is undone from its receipt.
    const undo = sidebar.getByRole('button', { name: '撤销本次修改' });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(undo).toBeDisabled();
    await expect(nodes).toHaveCount(before);
    // History lists this canvas's threads; a new thread starts empty.
    await sidebar.getByRole('button', { name: '线程历史', exact: true }).click();
    await expect(sidebar.getByTestId('space-thread')).toHaveCount(1);
    await sidebar.getByRole('button', { name: '新线程', exact: true }).click();
    await expect(sidebar).toContainText('对这张画布说要做什么');
    await sidebar.getByRole('button', { name: '线程历史', exact: true }).click();
    await sidebar.getByTestId('space-thread').click();
    await expect(header).toContainText('把提示词改成暖色调');
    // The full view of the thread is on the home page, in the project's thread list.
    await sidebar.getByRole('button', { name: '在首页查看', exact: true }).click();
    await expect(page.getByTestId('thread-header')).toContainText('把提示词改成暖色调');
    await expect(
      page.getByTestId('thread-link').filter({ hasText: '把提示词改成暖色调' }),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await server.close();
  }
});

test('the writing sidebar edits the open document in its editor, unsaved, and undoes the round', async () => {
  test.setTimeout(90000);
  const directory = test.info().outputPath('我的写作');
  await mkdir(directory, { recursive: true });
  const original = '# 周报\n\n这周完成了很多工作。\n';
  await writeFile(join(directory, '周报.md'), original);
  const server = await mockModel((body, step): MockReply => {
    const { system } = promptOf(body);
    if (isCoordinator(system)) return { text: '好的。' };
    if (step === 0) return call('read_document', {});
    if (step === 1) {
      const read = JSON.parse(toolResults(body)[0] ?? '{}') as { version: string; text: string };
      const from = read.text.indexOf('这周完成了很多工作。');
      return call('replace_range', {
        from,
        to: from + '这周完成了很多工作。'.length,
        text: '这周做完了三件事。',
        version: read.version,
      });
    }
    return { text: '改好了，尚未保存。' };
  });
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: server.url, model: 'mock' });
    await page.reload();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, directory);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹', exact: true }).click();
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '周报.md' })
      .click();
    await page.getByRole('button', { name: '展开右侧栏' }).click();
    const sidebar = page.getByRole('complementary', { name: '写作助手' });
    await expect(sidebar.getByTestId('writing-agent-context')).toContainText('周报.md');
    await sidebar.getByLabel('消息', { exact: true }).fill('把第一段改口语');
    await sidebar.getByRole('button', { name: '发送消息' }).click();
    await expect(sidebar.getByText('改好了，尚未保存。')).toBeVisible();
    await expect(page.getByTestId('space-thread-header')).toContainText('把第一段改口语');
    await expect(page.getByRole('textbox', { name: '块编辑器' })).toContainText(
      '这周做完了三件事。',
    );
    // The edit stays in the editor; the file on disk is unchanged.
    expect(await readFile(join(directory, '周报.md'), 'utf8')).toBe(original);
    await expect(sidebar).toContainText('编辑器内容已更新，尚未保存到磁盘。');
    await page.screenshot({ path: test.info().outputPath('writing-thread.png') });
    await sidebar.getByRole('button', { name: '撤销本次修改' }).click();
    await expect(page.getByRole('textbox', { name: '块编辑器' })).toContainText(
      '这周完成了很多工作。',
    );
    // History explains how threads change the document while it is closed.
    await sidebar.getByRole('button', { name: '线程历史', exact: true }).click();
    await expect(sidebar.getByTestId('space-thread')).toHaveCount(1);
    await expect(sidebar).toContainText('文档没打开时');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await server.close();
  }
});

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

async function launch(folder: string) {
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (item): item is [string, string] =>
          item[1] !== undefined && item[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  const page = await app.firstWindow();
  await app.evaluate(({ dialog, BrowserWindow }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  }, folder);
  await page.getByRole('button', { name: '写作空间', exact: true }).click();
  await page.getByRole('button', { name: '打开本地文件夹' }).click();
  return { app, page };
}
test('graph drag links buffers, disk links undo, broken links repair and panorama restores assistant', async () => {
  test.setTimeout(90000);
  const folder = test.info().outputPath('notes');
  await mkdir(folder, { recursive: true });
  const original = '# Alpha\n\n原文 [[missing]]\n';
  await writeFile(join(folder, 'a.md'), original);
  await writeFile(join(folder, 'b.md'), '# Beta');
  await writeFile(join(folder, 'c.md'), '# Gamma\n\n[[b]]');
  const { app, page } = await launch(folder);
  try {
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: 'a.md', exact: true })
      .click();
    await page.getByRole('button', { name: '展开右侧栏', exact: true }).click();
    await page.getByRole('tab', { name: '星图', exact: true }).click();
    const mini = page.getByTestId('writing-graph-mini');
    await expect(mini.locator('.react-flow__node').first()).toBeVisible();
    await mini.getByRole('button', { name: '在编辑区展开全景' }).click();
    const full = page.getByTestId('writing-graph-full');
    await expect(full).toBeVisible();
    await expect(page.getByRole('complementary', { name: '写作助手' })).toHaveCount(0);
    const source = full.locator('.react-flow__node[data-id="a.md"]');
    const target = full.locator('.react-flow__node[data-id="b.md"]');
    await source.hover();
    const from = await source.locator('.source').boundingBox();
    const to = await target.locator('.target').boundingBox();
    if (!from || !to) throw new Error('missing handles');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByText('已建立关联（未保存）', { exact: true })).toBeVisible();
    expect(await readFile(join(folder, 'a.md'), 'utf8')).toBe(original);
    await page.screenshot({ path: test.info().outputPath('graph-light.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: test.info().outputPath('graph-dark.png') });
    await full.getByRole('button', { name: '返回文档' }).click();
    await expect(page.getByRole('complementary', { name: '写作助手' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '块编辑器' })).toContainText('关联');
    await page
      .getByRole('region', { name: '文档关联' })
      .locator('summary')
      .filter({ hasText: '失效链接' })
      .click();
    await page.getByLabel('修复链接目标').selectOption('b.md');
    await page.getByRole('button', { name: '修复链接', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '块编辑器' })).not.toContainText('missing');
    expect(await readFile(join(folder, 'a.md'), 'utf8')).toBe(original);
    const disk = await page.evaluate(async () => {
      const api = window.desktop!.writing;
      const roots = await api.getRoots();
      if (!roots.ok) throw new Error(roots.error);
      const rootId = roots.value[0]!.id;
      const receipt = await api.link({ action: 'link', rootId, from: 'b.md', to: 'c.md' });
      if (!receipt.ok || !receipt.value.transactionId) throw new Error('missing receipt');
      return { rootId, id: receipt.value.transactionId };
    });
    expect(await readFile(join(folder, 'b.md'), 'utf8')).toContain('## 关联');
    const undone = await page.evaluate(
      (id) => window.desktop!.writing.link({ action: 'undo', transactionId: id }),
      disk.id,
    );
    expect(undone.ok).toBe(true);
    expect(await readFile(join(folder, 'b.md'), 'utf8')).toBe('# Beta');
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

test('2000 file graph renders a bounded mini view and interactive panorama', async () => {
  test.setTimeout(120000);
  const folder = test.info().outputPath('notes');
  await mkdir(folder, { recursive: true });
  for (let batch = 0; batch < 10; batch++)
    await Promise.all(
      Array.from({ length: 200 }, (_, n) => {
        const i = batch * 200 + n;
        return writeFile(
          join(folder, `note-${i}.md`),
          `# 点 ${i}\n\n${i < 1999 ? `[[note-${i + 1}]]` : ''}`,
        );
      }),
    );
  const { app, page } = await launch(folder);
  try {
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: 'note-0.md', exact: true })
      .click();
    const start = Date.now();
    await page.getByRole('tab', { name: '星图', exact: true }).click();
    const mini = page.getByTestId('writing-graph-mini');
    await expect(mini.locator('.react-flow__node').first()).toBeVisible();
    const miniMs = Date.now() - start;
    expect(await mini.locator('.react-flow__node').count()).toBeLessThanOrEqual(10);
    const fullStart = Date.now();
    await mini.getByRole('button', { name: '在编辑区展开全景' }).click();
    const full = page.getByTestId('writing-graph-full');
    await expect(full).toContainText('2000 个点');
    await expect(full.locator('.react-flow__node').first()).toBeVisible();
    const fullMs = Date.now() - fullStart;
    await full.getByLabel('搜索星图').fill('点 1999');
    await expect(full).toContainText('1 个点');
    await full.getByLabel('搜索星图').fill('');
    await full.getByLabel('只看孤岛').click();
    await expect(full).toContainText('0 个点');
    await full.getByLabel('只看孤岛').click();
    await full.getByLabel('星图时间轴').fill('0');
    await full.getByRole('button', { name: '播放时间轴' }).click();
    await expect(full.getByRole('button', { name: '停止回放' })).toBeVisible();
    await full.getByRole('button', { name: '停止回放' }).click();
    await writeFile(
      test.info().outputPath('performance.json'),
      JSON.stringify({ files: 2000, miniMs, fullMs }),
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('writing tree renames an open file, edits its new path, previews images and duplicates files', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'draft.md'), '# Draft\n');
  await writeFile(join(directory, 'note.txt'), 'plain text');
  await writeFile(join(directory, 'bundle.zip'), 'zip');
  await writeFile(
    join(directory, 'image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog, BrowserWindow }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    }, directory);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹' }).click();
    const tree = page.getByRole('navigation', { name: '文件列表' });
    await tree.getByRole('button', { name: 'draft.md', exact: true }).click();
    await tree.getByRole('button', { name: 'draft.md', exact: true }).press('F2');
    await page.getByRole('textbox', { name: '重命名文件' }).fill('renamed.md');
    await page.getByRole('textbox', { name: '重命名文件' }).press('Enter');
    await expect(page.getByRole('tab', { name: 'renamed.md', exact: true })).toBeVisible();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText('# Renamed\n');
    await editor.press('ControlOrMeta+s');
    await expect.poll(() => readFile(join(directory, 'renamed.md'), 'utf8')).toBe('# Renamed\n');
    await tree.getByRole('button', { name: 'renamed.md', exact: true }).press('ControlOrMeta+d');
    await expect(tree.getByRole('button', { name: 'renamed 副本.md', exact: true })).toBeVisible();
    await tree.getByRole('button', { name: 'image.png', exact: true }).click();
    await expect(page.getByRole('region', { name: '文件预览' })).toContainText('1 × 1');
    await page.screenshot({ path: test.info().outputPath('preview-light.png') });
    await tree.getByRole('button', { name: 'bundle.zip', exact: true }).click();
    await expect(page.getByRole('region', { name: '文件预览' })).toContainText('这个格式暂不支持');
    await tree.getByRole('button', { name: 'note.txt', exact: true }).click();
    await expect(editor).toContainText('plain text');
    await page.screenshot({ path: test.info().outputPath('tree-light.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: test.info().outputPath('tree-dark.png') });
  } finally {
    await app.close();
  }
});

test('legacy writing tabs migrate once into global tabs without losing multiple roots', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'legacy.md'), '# Legacy');
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, directory);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹' }).click();
    const key = await page.evaluate(async () => {
      const roots = await window.desktop!.writing.getRoots();
      if (!roots.ok || !roots.value[0]) throw new Error('missing root');
      const rootId = roots.value[0].id,
        key = 'jarvis:writing-tabs:' + rootId;
      localStorage.setItem(
        key,
        JSON.stringify({ paths: ['legacy.md'], active: rootId + ':legacy.md' }),
      );
      return key;
    });
    await page.reload();
    await expect(page.getByRole('tab', { name: 'legacy.md', exact: true })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
    await page.getByRole('tab', { name: 'legacy.md', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('Legacy');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'legacy.md', exact: true })).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('writing file menu moves, reveals and confirms trash through restricted IPC', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(join(directory, 'target'), { recursive: true });
  await writeFile(join(directory, 'draft.md'), '# Draft');
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
    await app.evaluate(({ dialog, shell }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      shell.showItemInFolder = (path) => {
        process.env.JARVIS_TEST_REVEALED = path;
      };
      shell.trashItem = async (path) => {
        process.env.JARVIS_TEST_TRASHED = path;
      };
    }, directory);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹' }).click();
    const tree = page.getByRole('navigation', { name: '文件列表' });
    await tree.getByRole('button', { name: 'draft.md', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '移动到…' }).click();
    await page.getByLabel('目标文件夹').selectOption('target');
    await page.getByRole('button', { name: '移动', exact: true }).click();
    await expect.poll(() => readFile(join(directory, 'target/draft.md'), 'utf8')).toBe('# Draft');
    await tree.getByRole('button', { name: 'target', exact: true }).click();
    const file = tree.getByRole('button', { name: 'draft.md', exact: true });
    await file.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /在访达中显示|在资源管理器中显示/ }).click();
    expect(await app.evaluate(() => process.env.JARVIS_TEST_REVEALED)).toBe(
      join(directory, 'target/draft.md'),
    );
    await file.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '移到废纸篓', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(await app.evaluate(() => process.env.JARVIS_TEST_TRASHED)).toBeUndefined();
    await file.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '移到废纸篓', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => process.env.JARVIS_TEST_TRASHED))
      .toBe(join(directory, 'target/draft.md'));
    expect(await readFile(join(directory, 'target/draft.md'), 'utf8')).toBe('# Draft');
  } finally {
    await app.close();
  }
});

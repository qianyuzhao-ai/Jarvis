import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

async function launch(profile: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  return electron.launch({
    args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
    env,
  });
}
async function choose(app: ElectronApplication, page: Page, directory: string) {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, directory);
  await page.getByRole('button', { name: '写作空间', exact: true }).click();
  await page.getByRole('button', { name: '打开本地文件夹', exact: true }).click();
}
const content =
  '# 从想法到初稿\n\n写下 **重要想法**。\n\n## 下一步\n\n- 梳理材料\n\n```md\n# 不是标题\n```\n';

test('writing reads real directories, edits, creates, searches and restores tabs', async () => {
  const directory = test.info().outputPath('我的写作');
  const profile = test.info().outputPath('profile');
  await mkdir(join(directory, '文章'), { recursive: true });
  await writeFile(join(directory, '文章', '初稿.md'), content);
  await writeFile(join(directory, '随记.md'), '# 随记\n');
  let app = await launch(profile);
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await choose(app, page, directory);
    await page.getByRole('button', { name: '文章', exact: true }).click();
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '初稿.md', exact: true })
      .click();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await expect(editor).toContainText('写下');
    await editor.focus();
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText(
      '# 编辑后的标题\n\n中文内容与 **加粗文字**。\n\n## 待办\n\n下一步行动。',
    );
    await editor.press('ControlOrMeta+s');
    await expect
      .poll(() => readFile(join(directory, '文章', '初稿.md'), 'utf8'))
      .toContain('编辑后的标题');
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible();
    await page.getByRole('button', { name: '新建文件', exact: true }).click();
    await page.getByLabel('文档名称').fill('新的草稿');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByRole('tab', { name: '新的草稿.md' })).toBeVisible();
    await expect.poll(() => readFile(join(directory, '文章', '新的草稿.md'), 'utf8')).toBe('');
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await page.getByLabel('文件夹名称').fill('素材');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: '文件列表' }).getByRole('button', { name: '素材' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '搜索文件', exact: true }).click();
    await page.getByLabel('搜索文件名').fill('随记');
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '随记.md' })
      .click();
    await expect(page.getByRole('tab', { name: '随记.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: '搜索文件', exact: true }).click();
    await expect(page.getByLabel('搜索文件名')).toBeHidden();
    await page.getByRole('tab', { name: '初稿.md' }).click();
    await expect(editor).toContainText('编辑后的标题');
    await editor.press('ControlOrMeta+z');
    await expect(editor).toContainText('从想法到初稿');
    await editor.press('ControlOrMeta+Shift+z');
    await editor.press('ControlOrMeta+s');
    await expect
      .poll(() => readFile(join(directory, '文章', '初稿.md'), 'utf8'))
      .toContain('编辑后的标题');
    await editor.press('ArrowRight');
    await expect(
      page
        .getByRole('navigation', { name: '文件列表' })
        .getByRole('button', { name: '初稿.md', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: test.info().outputPath('writing-light.png') });
    expect(errors).toEqual([]);
    await app.close();
    app = await launch(profile);
    const reopened = await app.firstWindow();
    await reopened.getByRole('button', { name: '写作空间', exact: true }).click();
    await expect(reopened.getByRole('tab', { name: '初稿.md' })).toBeVisible();
    await expect(reopened.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText(
      '编辑后的标题',
    );
  } finally {
    await app.close();
  }
});

test('writing boundaries, exclusive creation, CRLF and conflict protection', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '文档.md'), '\uFEFF# 原内容\r\n');
  const outside = test.info().outputPath('outside.md');
  await writeFile(outside, 'outside');
  if (process.platform !== 'win32') await symlink(outside, join(directory, 'link.md'));
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    await choose(app, page, directory);
    const rootId = await page.evaluate(async () => {
      const result = await window.desktop?.writing.getRoots();
      if (!result?.ok || !result.value[0]) throw new Error('missing root');
      return result.value[0].id;
    });
    const boundary = await page.evaluate(async (rootId) => {
      const api = window.desktop?.writing;
      return {
        traversal: await api?.readFile({ rootId, path: '../outside.md' }),
        unknown: await api?.readFile({ rootId: 'unapproved', path: '文档.md' }),
        duplicate: await api?.createEntry({ rootId, path: '', name: '文档.md', kind: 'file' }),
        reserved: await api?.createEntry({ rootId, path: '', name: '../坏文件', kind: 'file' }),
      };
    }, rootId);
    for (const result of Object.values(boundary)) expect(result?.ok).toBe(false);
    if (process.platform !== 'win32') {
      const result = await page.evaluate(
        (rootId) => window.desktop?.writing.readFile({ rootId, path: 'link.md' }),
        rootId,
      );
      expect(result?.ok).toBe(false);
    }
    const before = await page.evaluate(
      (rootId) => window.desktop?.writing.readFile({ rootId, path: '文档.md' }),
      rootId,
    );
    if (!before?.ok) throw new Error('read failed');
    const preserved = await page.evaluate(
      ({ rootId, revision }) =>
        window.desktop?.writing.saveFile({
          rootId,
          path: '文档.md',
          revision,
          content: '# 保留格式\n',
        }),
      { rootId, revision: before.value.revision },
    );
    if (!preserved?.ok) throw new Error('save failed');
    expect(await readFile(join(directory, '文档.md'), 'utf8')).toBe('\uFEFF# 保留格式\r\n');
    await writeFile(join(directory, '文档.md'), '# 外部修改\r\n');
    const conflict = await page.evaluate(
      ({ rootId, revision }) =>
        window.desktop?.writing.saveFile({
          rootId,
          path: '文档.md',
          revision,
          content: '不应覆盖',
        }),
      { rootId, revision: preserved.value.revision },
    );
    expect(conflict?.ok).toBe(false);
    expect(conflict && !conflict.ok && conflict.code).toBe('CONFLICT');
    expect(await readFile(join(directory, '文档.md'), 'utf8')).toBe('# 外部修改\r\n');
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '文档.md' })
      .click();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText('# 已保存\n\n中文。');
    await expect
      .poll(() => readFile(join(directory, '文档.md'), 'utf8'))
      .toBe('# 已保存\r\n\r\n中文。');
    await writeFile(join(directory, '文档.md'), '# 另一个编辑器的更新\r\n');
    await expect(editor).toContainText('另一个编辑器的更新', { timeout: 8000 });
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('writing retains a conflicted buffer and saves a separate copy', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '初稿.md'), '# 初稿\n');
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    await choose(app, page, directory);
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '初稿.md' })
      .click();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await expect(editor).toContainText('初稿');
    await writeFile(join(directory, '初稿.md'), '# 外部版本\n');
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText('# 本地未保存的内容');
    await editor.press('ControlOrMeta+s');
    await expect(page.getByRole('alert')).toContainText('已停止自动保存');
    expect(await readFile(join(directory, '初稿.md'), 'utf8')).toBe('# 外部版本\n');
    await page.getByRole('button', { name: '关闭 初稿.md' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByRole('tab', { name: /初稿.md/ })).toBeVisible();
    await page.getByRole('button', { name: '另存副本' }).click();
    await expect(page.getByRole('tab', { name: /初稿-副本-/ })).toBeVisible();
    await expect(editor).toContainText('本地未保存的内容');
    expect(await readFile(join(directory, '初稿.md'), 'utf8')).toBe('# 外部版本\n');
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('writing sidebar combinations, native chrome, assistant tab and dark mode', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '初稿.md'), content);
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await choose(app, page, directory);
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '初稿.md' })
      .click();
    await page.getByRole('button', { name: '展开右侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '写作助手' })).toContainText(
      '读取当前文档',
    );
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '写作文件目录' })).toBeHidden();
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeFocused();
    await page.getByRole('button', { name: '收起右侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '写作助手' })).toBeHidden();
    await expect
      .poll(async () =>
        Math.round((await page.getByTestId('writing-main').boundingBox())?.width ?? 0),
      )
      .toBe(1385);
    const documentWidth = await page.locator('.cm-content').boundingBox();
    expect(documentWidth?.width).toBe(560);
    await page.screenshot({ path: test.info().outputPath('writing-both-collapsed.png') });
    await page.getByRole('button', { name: '展开右侧栏' }).click();
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '通用', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: '返回工作台', exact: true }).click();
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('writing-dark.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await app.close();
  }
});

test('writing reload preserves a conflicted buffer on cancel and reads disk on confirmation', async () => {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '确认.md'), '# 初稿\n');
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    await choose(app, page, directory);
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '确认.md' })
      .click();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await expect(editor).toContainText('初稿');
    await writeFile(join(directory, '确认.md'), '# 外部版本\n');
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText('# 本地未保存的内容');
    await editor.press('ControlOrMeta+s');
    await expect(page.getByRole('alert')).toContainText('已停止自动保存');
    await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(editor).toContainText('本地未保存的内容');
    await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click();
    await expect(editor).toContainText('外部版本');
    expect(await readFile(join(directory, '确认.md'), 'utf8')).toBe('# 外部版本\n');
  } finally {
    await app.close();
  }
});

test('switching writing folders clears obsolete tabs and keeps the new document space active', async () => {
  const first = test.info().outputPath('第一目录'),
    second = test.info().outputPath('第二目录');
  await mkdir(first, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(join(first, '第一.md'), '# 第一个目录的内容');
  await writeFile(join(second, '第二.md'), '# 第二个目录的内容');
  const app = await launch(test.info().outputPath('profile'));
  try {
    const page = await app.firstWindow();
    await choose(app, page, first);
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '第一.md', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText(
      '第一个目录',
    );
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, second);
    await page.getByRole('button', { name: '第一目录', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开其他文件夹…' }).click();
    await expect(page.getByRole('button', { name: '写作空间', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('tab', { name: '第一.md', exact: true })).toHaveCount(0);
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '第二.md', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText(
      '第二个目录',
    );
    await page.getByRole('button', { name: '第二目录', exact: true }).click();
    await page.getByRole('menuitem', { name: '第一目录', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText(
      '第一个目录',
    );
    await expect(page.getByRole('tab', { name: '第二.md', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

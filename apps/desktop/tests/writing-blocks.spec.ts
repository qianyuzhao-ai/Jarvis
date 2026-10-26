import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('blocks open without writes, preserve Markdown through twenty view switches, and edit one block', async () => {
  test.setTimeout(60000);
  const folder = test.info().outputPath('notes');
  await mkdir(folder, { recursive: true });
  const source = '# 标题\n\n原始段落。\n\n* 保留列表\n* 保留符号\n';
  const path = join(folder, '文档.md');
  await writeFile(path, source);
  const before = await stat(path);
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
    page.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ dialog, BrowserWindow }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    }, folder);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹' }).click();
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '文档.md', exact: true })
      .click();
    const blocks = page.getByRole('textbox', { name: '块编辑器' });
    await expect(blocks).toContainText('原始段落');
    await expect(page.getByLabel('文档标题')).toHaveValue('文档');
    await blocks.evaluate((element) => {
      const paragraph = element.querySelector('p');
      if (!paragraph?.firstChild) throw new Error('missing paragraph');
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      (element as HTMLElement).focus();
    });
    await page.getByRole('tab', { name: '源码', exact: true }).click();
    await page.getByRole('textbox', { name: 'Markdown 编辑器' }).focus();
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe('原始段落。');
    await page.getByRole('tab', { name: '块视图', exact: true }).click();
    await blocks.focus();
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe('原始段落。');
    for (let i = 0; i < 20; i++) {
      await page.getByRole('tab', { name: '源码', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText(
        '原始段落',
      );
      await page.getByRole('tab', { name: '块视图', exact: true }).click();
      await expect(blocks).toContainText('原始段落');
    }
    expect(await readFile(path, 'utf8')).toBe(source);
    expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
    await blocks.getByText('原始段落。', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('补充');
    await blocks.press('ControlOrMeta+s');
    await expect
      .poll(() => readFile(path, 'utf8'))
      .toBe('# 标题\n\n原始段落。补充\n\n* 保留列表\n* 保留符号\n');
    await page.screenshot({ path: test.info().outputPath('blocks-light.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: test.info().outputPath('blocks-dark.png') });
    await blocks.locator('h1').evaluate((node) => {
      Reflect.set(window, '__writingHeadingIdentity', node);
    });
    await writeFile(path, source.replace('原始段落。', '外部更新。'));
    await expect(blocks).toContainText('外部更新。');
    expect(
      await blocks
        .locator('h1')
        .evaluate((node) => node === Reflect.get(window, '__writingHeadingIdentity')),
    ).toBe(true);
    await blocks.locator('p').filter({ hasText: '外部更新。' }).hover();
    await page.getByRole('button', { name: '块菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '转换为二级标题', exact: true }).click();
    await expect(blocks.getByRole('heading', { name: '外部更新。', level: 2 })).toBeVisible();
    await blocks.getByRole('heading', { name: '外部更新。', level: 2 }).hover();
    await page.getByRole('button', { name: '块菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '转换为正文', exact: true }).click();
    await writeFile(join(folder, '第二.md'), '# 第二篇');
    await blocks.getByText('外部更新。', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' [[第二');
    await page.getByRole('option', { name: '第二.md', exact: true }).click();
    await blocks.press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('[[第二]]');
    await blocks
      .getByRole('link', { name: '[[第二]]', exact: true })
      .click({ modifiers: ['ControlOrMeta'] });
    await expect(page.getByRole('tab', { name: '第二.md', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '文档.md', exact: true }).click();
    await blocks.evaluate((element) => {
      const binary = atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
      );
      const file = new File([Uint8Array.from(binary, (c) => c.charCodeAt(0))], 'paste.png', {
        type: 'image/png',
      });
      const data = new DataTransfer();
      data.items.add(file);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect
      .poll(() =>
        blocks
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) => (image as HTMLImageElement).naturalWidth === 1),
          ),
      )
      .toBe(true);
    await blocks.press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('./assets/');
    await page.getByRole('button', { name: '更换文档图标', exact: true }).click();
    await page.getByRole('button', { name: '🧠', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => readFile(path, 'utf8')).toContain('icon: "🧠"');
    await page.getByLabel('文档标题', { exact: true }).fill('新文件名');
    await page.getByLabel('文档标题', { exact: true }).press('Enter');
    await expect(page.getByRole('tab', { name: '新文件名.md', exact: true })).toBeVisible();
    expect(await readFile(join(folder, '新文件名.md'), 'utf8')).toContain('# 标题');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

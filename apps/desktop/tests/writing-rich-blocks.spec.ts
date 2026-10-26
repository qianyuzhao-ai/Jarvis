import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
async function launch() {
  const folder = test.info().outputPath('notes');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'rich.md'), '');
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
  const page = await app.firstWindow();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await app.evaluate(({ dialog, BrowserWindow }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  }, folder);
  await page.getByRole('button', { name: '写作空间', exact: true }).click();
  await page.getByRole('button', { name: '打开本地文件夹' }).click();
  await page
    .getByRole('navigation', { name: '文件列表' })
    .getByRole('button', { name: 'rich.md', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: '块编辑器' })).toBeVisible();
  return { app, page, folder, path: join(folder, 'rich.md'), requests };
}
async function insert(page: Page, query: string, label: string) {
  const editor = page.getByRole('textbox', { name: '块编辑器' });
  if (await editor.textContent()) {
    await page.getByRole('button', { name: '在下方添加块', exact: true }).click();
    await page.keyboard.insertText(query);
  } else {
    await editor.click();
    await page.keyboard.insertText('/' + query);
  }
  await page.getByRole('option', { name: label, exact: true }).click();
}

test('slash filters Chinese, pinyin and English, handles composition and inserts editable callouts and toggles', async () => {
  const { app, page, path } = await launch();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const editor = page.getByRole('textbox', { name: '块编辑器' });
    await editor.click();
    await page.keyboard.insertText('/zzzz');
    await expect(page.getByRole('listbox', { name: '插入块' })).toContainText('没有匹配');
    await page.keyboard.press('Escape');
    await page.keyboard.insertText('继续');
    await expect(page.getByRole('listbox', { name: '插入块' })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('/gaoliang');
    await expect(page.getByRole('option', { name: '高亮框', exact: true })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('/glk');
    await expect(page.getByRole('option', { name: '高亮框', exact: true })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('/callout');
    await editor.dispatchEvent('compositionstart');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('writing-callout')).toHaveCount(0);
    await editor.dispatchEvent('compositionend');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('/高亮');
    await page.screenshot({ path: test.info().outputPath('slash-light.png') });
    await page.getByRole('option', { name: '高亮框', exact: true }).click();
    const callout = page.getByTestId('writing-callout');
    await expect(callout).toBeVisible();
    await callout.getByLabel('高亮框类型').selectOption('warning');
    await callout.getByLabel('高亮框标题').fill('重要提醒');
    await callout.getByLabel('高亮框标题').press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('[!WARNING] 重要提醒');
    await callout.getByText('写下提示内容…', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('补充正文');
    await editor.press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('补充正文');
    await insert(page, 'zhedie', '折叠块');
    const toggle = page.getByTestId('writing-toggle');
    await toggle.getByLabel('折叠块标题').fill('折叠标题');
    await toggle.getByLabel('折叠块标题').press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('<summary>折叠标题</summary>');
    expect(await readFile(path, 'utf8')).not.toContain('zhedie');
    await expect(callout.getByLabel('高亮框标题')).toHaveValue('重要提醒');
    const before = await readFile(path, 'utf8');
    const time = (await stat(path)).mtimeMs;
    await toggle.getByRole('button', { name: '折叠内容', exact: true }).click();
    await toggle.getByRole('button', { name: '展开内容', exact: true }).click();
    expect(await readFile(path, 'utf8')).toBe(before);
    expect((await stat(path)).mtimeMs).toBe(time);
    await page.screenshot({ path: test.info().outputPath('rich-light.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: test.info().outputPath('rich-dark.png') });
    await page.reload();
    await expect(page.getByTestId('writing-callout')).toBeVisible();
    await expect(page.getByTestId('writing-toggle')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

test('mind map shortcuts save two-space Markdown and invalid sources remain editable', async () => {
  const { app, page, path } = await launch();
  try {
    await insert(page, '思维', '思维导图');
    const map = page.getByTestId('writing-mindmap');
    const canvas = map.getByRole('application', { name: '思维导图画布' });
    await canvas.focus();
    await page.keyboard.press('Tab');
    const input = map.getByRole('textbox', { name: '导图节点文字' });
    await input.fill('键盘分支');
    await input.press('Enter');
    await canvas.focus();
    await page.keyboard.press('Enter');
    await input.fill('同级分支');
    await input.press('Enter');
    await canvas.focus();
    await page.keyboard.press('Delete');
    await canvas.press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('  - 键盘分支');
    expect(await readFile(path, 'utf8')).not.toContain('同级分支');
    await page.screenshot({ path: test.info().outputPath('mindmap-light.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: test.info().outputPath('mindmap-dark.png') });
    await map.getByRole('button', { name: '编辑导图源码' }).click();
    await map.getByLabel('思维导图源码').fill('- 根\n   - 非法缩进');
    await expect(map.getByRole('alert')).toContainText('两个空格');
    await map.getByLabel('思维导图源码').fill('- 根\n  - 正确分支');
    await map.getByRole('button', { name: '查看导图' }).click();
    await expect(canvas).toBeVisible();
    await map.getByRole('button', { name: '全屏编辑' }).click();
    await expect(page.getByRole('dialog')).toContainText('正确分支');
    await page.keyboard.press('Escape');
    await canvas.press('ControlOrMeta+s');
    await page.reload();
    await expect(page.getByTestId('writing-mindmap')).toContainText('正确分支');
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

test('Mermaid loads lazily, renders safely and recovers from invalid syntax', async () => {
  const { app, page, path, requests } = await launch();
  try {
    expect(requests.some((url) => /mermaid\.core/.test(url))).toBe(false);
    await insert(page, 'mermaid', '流程图 / 图表');
    const block = page.getByTestId('writing-mermaid');
    await expect(block.getByRole('img', { name: 'Mermaid 图表' }).locator('svg')).toBeVisible({
      timeout: 15000,
    });
    expect(
      requests.some((url) => /mermaid\.core/.test(url)),
      requests.join('\n'),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('mermaid-light.png') });
    const oldSvg = await block.getByRole('img').locator('svg').getAttribute('id');
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await expect
      .poll(() => block.getByRole('img').locator('svg').getAttribute('id'))
      .not.toBe(oldSvg);
    await page.screenshot({ path: test.info().outputPath('mermaid-dark.png') });
    await block.getByRole('tab', { name: '编辑源码', exact: true }).click();
    await block.getByLabel('Mermaid 源码').fill('not a diagram');
    await block.getByRole('tab', { name: '预览图表' }).click();
    await expect(block.getByRole('alert')).toBeVisible();
    await block.getByLabel('Mermaid 源码').fill('flowchart LR\n A[恢复] --> B[完成]');
    await expect(block.getByRole('img', { name: 'Mermaid 图表' }).locator('svg')).toBeVisible();
    await page.getByRole('textbox', { name: '块编辑器' }).press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('```mermaid');
    await block.getByRole('tab', { name: '编辑源码', exact: true }).click();
    await block
      .getByLabel('Mermaid 源码')
      .fill(
        '%%{init: {"securityLevel":"loose","themeCSS":"body{display:none}"}}%%\nflowchart LR\n A["<img src=x onerror=window.w3Unsafe=1>"] --> B',
      );
    await block.getByRole('tab', { name: '预览图表', exact: true }).click();
    await expect(block.getByRole('img').locator('svg')).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'w3Unsafe'))).toBeUndefined();
    await expect(page.getByTestId('writing-main')).toBeVisible();
    await block.getByLabel('图表模板').selectOption('flow');
    await page.getByRole('textbox', { name: '块编辑器' }).press('ControlOrMeta+s');
    await page.reload();
    await expect(page.getByTestId('writing-mermaid').getByRole('img').locator('svg')).toBeVisible();
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

test('table rows, columns and alignment roundtrip and code blocks expose language highlighting', async () => {
  const { app, page, path } = await launch();
  try {
    await insert(page, 'table', '表格');
    const table = page.getByTestId('writing-table-block');
    await expect(table.getByRole('row')).toHaveCount(2);
    await table.getByRole('button', { name: '+ 行', exact: true }).click();
    await expect(table.getByRole('row')).toHaveCount(3);
    await table.getByRole('button', { name: '+ 列', exact: true }).click();
    await expect(table.getByRole('columnheader')).toHaveCount(4);
    await table.getByRole('columnheader').first().click();
    await table.getByLabel('表格列对齐').selectOption('center');
    await page.getByRole('textbox', { name: '块编辑器' }).press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toMatch(/:\s*-+:|:-+:|:--+:/);
    await insert(page, 'code', '代码块');
    const code = page.getByTestId('writing-code-block');
    await expect(code.locator('.hljs-keyword')).toContainText('const');
    await code.getByLabel('代码语言').selectOption('python');
    await code.locator('code').click();
    await code.locator('code').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.insertText('print("ready")');
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (value) => {
        Reflect.set(window, 'w3CopiedCode', value);
      };
    });
    await code.getByRole('button', { name: '复制', exact: true }).click();
    expect(await page.evaluate(() => Reflect.get(window, 'w3CopiedCode'))).toBe('print("ready")');
    await page.getByRole('textbox', { name: '块编辑器' }).press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('```python');
    await page.screenshot({ path: test.info().outputPath('table-code-light.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: test.info().outputPath('table-code-dark.png') });
    await page.reload();
    await expect(page.getByTestId('writing-table-block').getByRole('row')).toHaveCount(3);
    await expect(page.getByTestId('writing-code-block').getByLabel('代码语言')).toHaveValue(
      'python',
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

test('image caption persists while resizing and alignment stay in the view', async () => {
  const { app, page, path } = await launch();
  try {
    const editor = page.getByRole('textbox', { name: '块编辑器' });
    await editor.click();
    await page.keyboard.insertText('/image');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('option', { name: '图片', exact: true }).click();
    await (await chooser).setFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    const image = page.getByTestId('writing-image-block');
    await expect(image.locator('img')).toBeVisible();
    await image.getByLabel('图片图注').fill('图注测试');
    await image.getByLabel('图片图注').press('ControlOrMeta+s');
    await expect.poll(() => readFile(path, 'utf8')).toContain('![图注测试](./assets/');
    const content = await readFile(path, 'utf8');
    const handle = image.getByRole('slider', { name: '调整图片宽度' });
    await handle.focus();
    await handle.press('ArrowRight');
    await image.getByLabel('图片对齐').selectOption('right');
    expect(await readFile(path, 'utf8')).toBe(content);
    await page.reload();
    await expect(page.getByTestId('writing-image-block').getByLabel('图片图注')).toHaveValue(
      '图注测试',
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

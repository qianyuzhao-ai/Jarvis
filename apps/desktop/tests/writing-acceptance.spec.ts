import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

function previewPdf() {
  const content =
    'BT /F1 24 Tf 72 720 Td (Writing Space Acceptance) Tj 0 -42 Td /F1 14 Tf (Local PDF preview - one page) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
async function screenshots(page: Page, name: string) {
  await page.mouse.move(15, 15);
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await page.screenshot({
      path: test.info().outputPath(`${name}-${theme}.png`),
      animations: 'disabled',
    });
  }
}

test('writing acceptance captures eight page states and serves an actual PDF preview', async () => {
  test.setTimeout(90000);
  const folder = test.info().outputPath('notes');
  await mkdir(folder, { recursive: true });
  const blocks =
    '# 本周进展\n\n从记录中整理下一步行动，原文保持 Markdown。\n\n> [!NOTE] 本轮目标\n> 验证编辑、关联与回溯。\n\n```mindmap\n- 写作空间\n  - 目录\n  - 块编辑\n  - 星图\n```\n';
  const commands =
    '# 让想法互相连接\n\n把共同问题留在一起，方便下一次继续。\n\n<details><summary>下一步</summary>\n\n核对引用，保留原意。\n\n</details>\n\n继续记录。\n';
  await writeFile(join(folder, '周报草稿.md'), blocks);
  await writeFile(join(folder, '命令与关联.md'), commands);
  await writeFile(join(folder, '十月复盘.md'), '# 十月复盘\n\n[[周报草稿]] [[命令与关联]] #计划');
  await writeFile(join(folder, '写作方案.md'), '# 写作方案\n\n[[周报草稿]] #计划');
  await writeFile(join(folder, '选题池.md'), '# 选题池\n\n[[十月复盘]]');
  await writeFile(join(folder, '随手记.md'), '# 随手记\n\n尚未归类的片段。');
  await writeFile(join(folder, '预览.pdf'), previewPdf());
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
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.evaluate(({ dialog, BrowserWindow }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    }, folder);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹' }).click();
    const files = page.getByRole('navigation', { name: '文件列表' });
    await files.getByRole('button', { name: '周报草稿.md', exact: true }).click();
    await page.getByRole('button', { name: '展开右侧栏', exact: true }).click();
    await expect(page.getByTestId('writing-mindmap')).toContainText('写作空间');
    await expect(page.getByLabel('文档标题')).toHaveCSS('font-weight', '700');
    await expect(page.getByLabel('文档标题')).toHaveCSS('font-size', '32px');
    await screenshots(page, '01-blocks');
    expect(await readFile(join(folder, '周报草稿.md'), 'utf8')).toBe(blocks);
    await files.getByRole('button', { name: '命令与关联.md', exact: true }).click();
    await expect(page.getByTestId('writing-toggle')).toBeVisible();
    await page.getByRole('region', { name: '文档关联' }).locator('summary').first().click();
    await expect(page.getByRole('region', { name: '文档关联' })).toContainText('十月复盘.md');
    const editor = page.getByRole('textbox', { name: '块编辑器' });
    await editor.getByText('继续记录。', { exact: true }).hover();
    await page.getByRole('button', { name: '在下方添加块', exact: true }).click();
    await page.keyboard.insertText('导图');
    await expect(page.getByRole('listbox', { name: '插入块' })).toBeVisible();
    await page
      .getByRole('region', { name: '文档关联' })
      .getByRole('button', { name: '十月复盘.md' })
      .scrollIntoViewIfNeeded();
    // The menu sits right below the line that opened it (or right above when there is no room).
    const line = (await editor.getByText('/导图', { exact: true }).boundingBox())!;
    const menu = (await page.getByRole('listbox', { name: '插入块' }).boundingBox())!;
    const gap =
      menu.y >= line.y ? menu.y - (line.y + line.height) : line.y - (menu.y + menu.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(16);
    await screenshots(page, '02-slash-backlinks');
    await editor.press('Escape');
    await editor.press('ControlOrMeta+z');
    await page.getByRole('tab', { name: '星图', exact: true }).click();
    const viewport = page.getByTestId('writing-graph-mini').locator('.react-flow__viewport');
    await expect
      .poll(async () =>
        Number(/scale\(([\d.]+)\)/.exec((await viewport.getAttribute('style')) ?? '')?.[1] ?? 0),
      )
      .toBeGreaterThanOrEqual(0.9);
    const mini = page.getByTestId('writing-graph-mini');
    const pane = (await mini.locator('.react-flow').boundingBox())!;
    const current = (await mini.locator('.writing-dot.is-active').boundingBox())!;
    expect(Math.abs(current.x + current.width / 2 - (pane.x + pane.width / 2))).toBeLessThan(48);
    expect(current.y).toBeGreaterThan(pane.y + 24);
    await page
      .getByTestId('writing-graph-mini')
      .getByRole('button', { name: '在编辑区展开全景' })
      .click();
    await expect(page.getByTestId('writing-graph-full')).toContainText('7 个点');
    await expect(
      page.getByTestId('writing-graph-full').locator('.react-flow__node').first(),
    ).toBeVisible();
    await screenshots(page, '03-graph');
    await page.getByTestId('writing-graph-full').getByRole('button', { name: '返回文档' }).click();
    await page.getByRole('tab', { name: '文件', exact: true }).click();
    const response = page.waitForResponse(
      (response) =>
        response.url().startsWith('jarvis-writing:') &&
        decodeURIComponent(response.url()).includes('预览.pdf'),
    );
    await files.getByRole('button', { name: '预览.pdf', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect
      .poll(() => page.frames().some((frame) => frame.url().startsWith('chrome-extension://')))
      .toBe(true);
    const pdf = page.frames().find((frame) => frame.url().startsWith('chrome-extension://'))!;
    await expect(pdf.locator('pdf-viewer')).toBeVisible();
    await expect
      .poll(() =>
        pdf.evaluate(() => Reflect.get(document.querySelector('pdf-viewer')!, 'loadProgress_')),
      )
      .toBe(100);
    await expect(pdf.locator('embed[type="application/x-google-chrome-pdf"]')).toHaveAttribute(
      'original-url',
      /^jarvis-writing:/,
    );
    await expect(pdf.locator('viewer-toolbar')).toBeVisible();
    await expect(page.getByRole('complementary', { name: '写作助手' })).toHaveCount(0);
    await screenshots(page, '04-pdf-preview');
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});

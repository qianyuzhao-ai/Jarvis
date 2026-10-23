import { resolve } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
let server: ViteDevServer;
let app: ElectronApplication;
let page: Page;
test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: resolve(import.meta.dirname, '../src/renderer'),
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
});
test.afterAll(async () => {
  await server?.close();
});
test.beforeEach(async () => {
  app = await electron.launch({
    args: [
      resolve(import.meta.dirname, 'fixtures/ui-preview-main.cjs'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
      UI_PREVIEW_URL: `${server.resolvedUrls!.local[0]}#/ui-preview`,
    },
  });
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'UI V1 Preview' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(async () => {
  await app?.close();
});
for (const theme of ['light', 'dark']) {
  test(`component preview ${theme} matches the reviewed baseline`, async () => {
    if (theme === 'dark') await page.getByRole('button', { name: '切换预览主题' }).click();
    await page.getByRole('button', { name: '固定提示' }).scrollIntoViewIfNeeded();
    await page.mouse.move(5, 5);
    await expect(page).toHaveScreenshot(`preview-${theme}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
    for (const [size, height] of [
      ['xs', 20],
      ['sm', 24],
      ['default', 28],
      ['lg', 32],
      ['icon-xs', 20],
      ['icon-sm', 24],
      ['icon', 28],
      ['icon-lg', 32],
    ] as const) {
      const button = page.getByRole('button', { name: `secondary-${size}`, exact: true });
      expect((await button.boundingBox())?.height).toBe(height);
      if (size.startsWith('icon')) expect((await button.boundingBox())?.width).toBe(height);
    }
    const primary = page.getByRole('button', { name: 'default-default', exact: true });
    await expect(primary).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(0, 122, 255)' : 'rgb(10, 132, 255)',
    );
    await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)');
    await primary.hover();
    await expect(primary).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(0, 106, 224)' : 'rgb(61, 155, 255)',
    );
    await expect(page.getByLabel('输入-invalid')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('输入-invalid')).toHaveAccessibleDescription('请输入完整地址');
    await expect(page.getByLabel('输入-readOnly')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('单行自动')).toHaveCSS('height', '28px');
    await expect(page.getByLabel('空错误字段')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('选择占位')).toHaveValue('');
    await expect(page.getByLabel('组错误')).toHaveCSS('outline-style', 'none');
  });
}
test('controls preserve keyboard, composition, refs, loading width, labels and tooltip dismissal', async () => {
  const invalid = page.getByLabel('内联错误');
  await invalid.focus();
  await expect(invalid).toHaveCSS('border-top-color', 'rgb(255, 59, 48)');
  const primary = page.getByRole('button', { name: 'default-default', exact: true });
  await primary.hover();
  await page.mouse.down();
  await expect(primary).toHaveCSS('background-color', 'rgb(0, 91, 194)');
  await page.mouse.up();
  await page.evaluate(() => {
    document.documentElement.dataset.windowActive = 'false';
  });
  await expect(primary).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.evaluate(() => {
    document.documentElement.dataset.windowActive = 'true';
  });
  await page.getByLabel('选择-default').selectOption('responses');
  await expect(page.getByLabel('选择-default')).toHaveValue('responses');
  const button = page.getByRole('button', { name: '防重复提交' });
  const width = (await button.boundingBox())?.width;
  await button.focus();
  await expect(button).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Enter');
  await expect(button).toBeDisabled();
  expect((await button.boundingBox())?.width).toBe(width);
  await page.keyboard.press('Enter');
  await page.getByRole('link', { name: '链接提交' }).dispatchEvent('click');
  await expect(page.getByLabel('提交次数')).toHaveText('1');
  await page.getByRole('button', { name: '完成测试' }).click();
  const check = page.getByRole('checkbox', { name: '选项-false', exact: true });
  await page.getByText('选项-false', { exact: true }).click();
  await expect(check).toBeChecked();
  await check.focus();
  await page.keyboard.press('Space');
  await expect(check).not.toBeChecked();
  const group = page.getByRole('radiogroup', { name: '主题-segmented-default', exact: true });
  const choice = group.getByRole('radio', { name: '跟随系统' });
  await choice.focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Light', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(group.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: '聚焦输入' }).click();
  await expect(page.getByLabel('Ref 输入')).toBeFocused();
  const text = page.getByLabel('自动增高');
  const before = (await text.boundingBox())!.height;
  await text.fill('第一行\n第二行\n第三行\n第四行\n第五行');
  expect((await text.boundingBox())!.height).toBeGreaterThan(before);
  await text.dispatchEvent('compositionstart');
  await page.keyboard.insertText('中文输入');
  await text.dispatchEvent('compositionend');
  await expect(text).toHaveValue(/中文输入/);
  await page.getByRole('button', { name: '提示测试' }).focus();
  await expect(page.getByRole('tooltip').filter({ hasText: '新建对话' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip').filter({ hasText: '新建对话' })).toHaveCount(0);
  await page.getByLabel('输入-filled').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('输入-readOnly')).toBeFocused();
});

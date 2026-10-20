import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('desktop boots with isolation and a working sidebar', async () => {
  const testInfo = test.info();
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );

  const application = await electron.launch({
    args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${testInfo.outputPath('profile')}`],
    env: environment,
  });

  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await expect(page.getByRole('heading', { name: '基础工作台已就绪' })).toBeVisible();
    await expect(page.locator('.runtime-info')).toContainText('Electron');

    const renderer = await page.evaluate(() => ({
      bridge: window.desktop,
      hasRequire: 'require' in window,
      hasProcess: 'process' in window,
    }));
    expect(renderer.bridge?.versions.electron).toBeTruthy();
    expect(renderer.hasRequire).toBe(false);
    expect(renderer.hasProcess).toBe(false);

    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '主导航' })).toBeHidden();
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect(page.getByRole('complementary', { name: '主导航' })).toBeVisible();

    await page.evaluate(() => window.open('https://example.invalid'));
    expect(application.windows()).toHaveLength(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('desktop.png') });
  } finally {
    await application.close();
  }
});

import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('general settings offer system, light and dark preferences with persistence', async () => {
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
    const root = page.locator('html');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('heading', { name: '通用设置' })).toBeVisible();
    const choices = page.getByRole('radiogroup', { name: '主题' });
    await expect(choices.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: '跟随系统', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(root).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'Light Mode', exact: true }).click();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(root).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: test.info().outputPath('general-light.png') });
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('save-status')).toHaveText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Dark Mode', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: test.info().outputPath('general-dark.png') });
    await page.getByRole('radio', { name: '跟随系统', exact: true }).click();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('save-status')).toHaveText('已保存到本机');
    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('radio', { name: '跟随系统', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('button', { name: /外观/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '切换主题' })).toHaveCount(0);
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(root).toHaveAttribute('data-theme', 'light');
  } finally {
    await app.close();
  }
});

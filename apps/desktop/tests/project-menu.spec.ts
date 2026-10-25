import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('project menu opens tabs, confirms deletion and restores the remaining project', async () => {
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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    for (const name of ['1', '2']) {
      await page.getByRole('button', { name: '新建项目', exact: true }).click();
      await page.getByLabel('项目名称', { exact: true }).fill(name);
    }
    await page.getByRole('button', { name: '图像', exact: true }).click();
    const rows = page.getByTestId('project-row');
    const more = () =>
      rows
        .filter({ hasText: /^1/ })
        .locator('..')
        .getByRole('button', { name: '更多', exact: true });
    const tabs = page.getByRole('tablist', { name: '窗口标签' });
    await more().hover();
    await expect(page.getByRole('tooltip')).toHaveText('更多');
    await more().click();
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('2');
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['在新标签页打开', '重命名', '删除']);
    const width = await menu.evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThan(200);
    expect(width).toBeGreaterThan(80);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('project-menu-light.png'),
    });
    await page.getByRole('menuitem', { name: '在新标签页打开', exact: true }).click();
    await expect(tabs.getByRole('tab', { name: '1', exact: true })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: '2', exact: true })).toBeVisible();
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('1');
    const count = await tabs.getByRole('tab').count();
    await more().click();
    await page.getByRole('menuitem', { name: '在新标签页打开', exact: true }).click();
    await expect(tabs.getByRole('tab')).toHaveCount(count);
    await more().click();
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('删除“1”后无法恢复');
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await more().click();
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await confirm.getByRole('button', { name: '删除项目', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toBeFocused();
    await expect(tabs.getByRole('tab', { name: '1', exact: true })).toHaveCount(0);
    await tabs.getByRole('tab', { name: '2', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await page.reload();
    await expect(rows).toHaveCount(1);
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('2');
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await rows.locator('..').getByRole('button', { name: '更多', exact: true }).click();
    expect(await menu.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(
      320,
    );
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('project-menu-dark-compact.png'),
    });
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await confirm.getByRole('button', { name: '删除项目', exact: true }).click();
    await expect(tabs.getByRole('tab', { name: '2', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await expect(rows).toHaveCount(0);
  } finally {
    await app.close();
  }
});

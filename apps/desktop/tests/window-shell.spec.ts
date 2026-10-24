import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
test('window shell opens, deduplicates, travels, closes and restores cross-space tabs', async () => {
  const profile = test.info().outputPath('profile');
  const launch = () =>
    electron.launch({
      args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
        ),
      ),
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const tabs = () => page.getByRole('tablist', { name: '窗口标签' });
    await expect(tabs().getByRole('tab')).toHaveCount(1);
    await expect(tabs()).toHaveCSS('-webkit-app-region', 'drag');
    await expect(tabs().locator('[data-ui="window-tab"]').first()).toHaveCSS(
      '-webkit-app-region',
      'no-drag',
    );
    await expect(page.getByRole('button', { name: '日历（即将推出）' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '展开画布助手' })).toHaveCount(0);
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('第一画布');
    await page.getByRole('button', { name: '更多 第一画布' }).click();
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
    await page.getByLabel('新名称', { exact: true }).fill('侧栏重命名');
    await page.getByRole('button', { name: '保存名称', exact: true }).click();
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('侧栏重命名');
    await expect(tabs().getByRole('tab', { name: '侧栏重命名', exact: true })).toBeVisible();
    await page.getByLabel('项目名称', { exact: true }).fill('第一画布');
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('第二画布');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('第一画布');
    await page.getByRole('button', { name: '前进', exact: true }).click();
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('第二画布');
    await page
      .getByTestId('project-row')
      .filter({ hasText: '第一画布' })
      .click({ modifiers: ['ControlOrMeta'] });
    await expect(tabs().getByRole('tab')).toHaveCount(3);
    await page.getByRole('button', { name: '展开画布助手' }).click();
    await tabs().getByRole('tab', { name: '第二画布', exact: true }).click();
    await expect(page.getByRole('button', { name: '展开画布助手' })).toBeVisible();
    await page
      .getByTestId('project-row')
      .filter({ hasText: '第一画布' })
      .click({ modifiers: ['ControlOrMeta'] });
    await expect(tabs().getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '收起画布助手' })).toBeVisible();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('unsaved');
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('unsaved');
    await tabs().getByRole('tab', { name: '第一画布', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('req_from', { exact: true })).toHaveValue('unsaved');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await tabs().getByRole('tab', { name: '第一画布', exact: true }).click();
    await page.keyboard.press('ControlOrMeta+t');
    await expect(tabs().getByRole('tab')).toHaveCount(5);
    await page.keyboard.press('ControlOrMeta+w');
    await expect(tabs().getByRole('tab')).toHaveCount(4);
    await tabs().getByRole('tab', { name: '第一画布', exact: true }).click();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(tabs().getByRole('tab', { name: '第一画布', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: '收起画布助手' })).toBeVisible();
    await expect(page.getByRole('button', { name: '后退', exact: true })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath('window-shell.png') });
  } finally {
    await app.close();
  }
});

test('project sidebar preserves name sorting and search without replacing the active canvas', async () => {
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
    for (const name of ['Zulu', 'Alpha']) {
      await page.getByRole('button', { name: '新建项目', exact: true }).click();
      await page.getByLabel('项目名称', { exact: true }).fill(name);
    }
    await page.getByLabel('项目排序').selectOption('name');
    const rows = page.getByTestId('project-row');
    await expect(rows.nth(0)).toContainText('Alpha');
    await expect(rows.nth(1)).toContainText('Zulu');
    await page.getByRole('button', { name: '展开项目搜索' }).click();
    await page.getByRole('textbox', { name: '搜索项目', exact: true }).fill('Zu');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Zulu');
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('Alpha');
    await page.getByRole('textbox', { name: '搜索项目', exact: true }).fill('missing');
    await expect(rows).toHaveCount(0);
    await expect(page.getByText('没有找到匹配的项目')).toBeVisible();
    await page.getByRole('textbox', { name: '搜索项目', exact: true }).press('Escape');
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole('button', { name: '展开项目搜索' })).toBeFocused();
    await expect(page.getByRole('textbox', { name: '搜索项目', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

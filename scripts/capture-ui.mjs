import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(process.cwd() + '/apps/desktop/package.json');
const { _electron: electron, expect } = require('@playwright/test');
const phase = process.argv[2] ?? 'before';
const dir = process.cwd() + '/apps/desktop/test-results/ui-v1/' + phase;
await mkdir(dir, { recursive: true });
for (const theme of ['light', 'dark']) {
  const app = await electron.launch({
    args: [
      process.cwd() + '/apps/desktop',
      '--user-data-dir=/tmp/jarvis-ui-v1-' + phase + '-' + theme + '-' + Date.now(),
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 820));
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
    const snap = async (name) => {
      await page.mouse.move(1100, 40);
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(350);
      await page.screenshot({ path: dir + '/' + name + '-' + theme + '.png' });
    };
    await snap('chat');
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await snap('projects');
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByLabel('项目名称', { exact: true }).fill('视觉基线');
    await snap('canvas');
    await page.getByRole('button', { name: '返回项目列表' }).click();
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await snap('writing');
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await snap('general');
    for (const [name, label] of [
      ['models', '模型服务'],
      ['services', '内网地址'],
      ['plugins', '插件'],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await snap(name);
      if (phase === 'phase-d' && name === 'models') {
        await page.getByRole('button', { name: '添加模型', exact: true }).click();
        await snap('model-form');
        await page.getByLabel('服务来源').selectOption('deepseek');
        await snap('model-deepseek');
        await page.getByRole('button', { name: '取消', exact: true }).click();
      }
      if (phase === 'phase-d' && name === 'plugins') {
        await page.getByRole('tab', { name: 'MCP', exact: true }).click();
        await snap('plugins-mcp');
      }
      if (phase === 'phase-d' && name === 'services') {
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(900, 640),
        );
        await snap('services-narrow');
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(1280, 820),
        );
      }
    }
  } finally {
    await app.close();
  }
}
console.log(dir);

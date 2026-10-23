import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchUpdateApp as launch } from './update-fixtures';
import type { UpdateEvent } from '../src/main/updates/service';

async function simulate(
  app: ElectronApplication,
  mode: 'flow' | 'ready' | 'installer-error',
  audit: string,
) {
  await app.evaluate(
    async ({ app, dialog, BrowserWindow, ipcMain }, input) => {
      const require = process
        .getBuiltinModule('node:module')
        .createRequire(app.getAppPath() + '/package.json');
      const { writeFileSync } = require('node:fs');
      const entry = require(app.getAppPath() + '/tests/fixtures/updates-main.cjs');
      let emit: (event: UpdateEvent) => void = () => {};
      let checks = 0;
      let downloads = 0;
      let installs = 0;
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
      const service = entry.configureUpdates({
        async check() {
          checks++;
          if (input.mode === 'flow' && (checks === 1 || checks === 3))
            emit({ type: 'error', message: '测试网络连接失败' });
          else if (input.mode === 'flow' && checks === 2) emit({ type: 'current' });
          else emit({ type: 'available', version: '0.1.9' });
        },
        async download() {
          downloads++;
          if (input.mode === 'flow') {
            emit({
              type: 'progress',
              progress: {
                percent: downloads === 1 ? 25 : 60,
                transferred: (downloads === 1 ? 2.5 : 6) * 1048576,
                total: 10 * 1048576,
                bytesPerSecond: 2 * 1048576,
              },
            });
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          if (input.mode === 'flow' && downloads === 1)
            emit({ type: 'error', message: '测试下载连接中断' });
          else emit({ type: 'downloaded' });
        },
        quitAndInstall() {
          if (input.mode === 'installer-error') throw new Error('测试安装器启动失败');
          installs++;
          ipcMain.emit('test-update-installed', BrowserWindow.getAllWindows().length === 0);
        },
        subscribe(listener: (event: UpdateEvent) => void) {
          emit = listener;
          return () => {};
        },
      });
      app.once('will-quit', () => writeFileSync(input.audit, String(installs)));
      service.startAutomaticChecks(5, 4 * 60 * 60 * 1000);
    },
    { mode, audit },
  );
}

test('development mode is explicit, security flags stay enabled, and an untrusted window cannot update', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const panel = page.getByRole('region', { name: '应用更新', exact: true });
    await expect(panel).toContainText('开发模式不检查更新');
    await expect(panel.getByRole('button', { name: '检查更新' })).toBeDisabled();
    const result = await app.evaluate(async ({ app, BrowserWindow }) => {
      const require = process
        .getBuiltinModule('node:module')
        .createRequire(app.getAppPath() + '/package.json');
      const updater = require('electron-updater').autoUpdater;
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: app.getAppPath() + '/out/preload/index.cjs',
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      try {
        await window.loadFile(app.getAppPath() + '/out/renderer/index.html');
        return {
          flags: {
            autoDownload: updater.autoDownload,
            autoInstallOnAppQuit: updater.autoInstallOnAppQuit,
            allowPrerelease: updater.allowPrerelease,
            allowDowngrade: updater.allowDowngrade,
          },
          response: await window.webContents.executeJavaScript('window.desktop.updates.check()'),
        };
      } finally {
        window.destroy();
      }
    });
    expect(result.flags).toEqual({
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: true,
      allowDowngrade: false,
    });
    expect(result.response).toMatchObject({ ok: false, error: '更新请求来源不可信。' });
  } finally {
    await app.close();
  }
});

test('automatic and manual checks, download retry/progress, route changes and install cancellation work in a real window', async () => {
  const audit = test.info().outputPath('installed.txt');
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await simulate(app, 'flow', audit);
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const panel = page.getByRole('region', { name: '应用更新', exact: true });
    await expect(panel.getByRole('alert')).toContainText('测试网络连接失败');
    await panel.getByRole('button', { name: '检查更新' }).click();
    await expect(panel.getByRole('status')).toHaveText('当前已是最新版本');
    await panel.getByRole('button', { name: '检查更新' }).click();
    await expect(panel.getByRole('status')).toHaveText('本次检查未完成');
    await panel.getByRole('button', { name: '检查更新' }).click();
    await expect(panel.getByRole('button', { name: '下载更新' })).toBeVisible();
    await panel.getByRole('button', { name: '下载更新' }).click();
    await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await expect(page.getByRole('region', { name: '更新提醒', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('alert')).toContainText('测试下载连接中断');
    await panel.getByRole('button', { name: '重试下载' }).click();
    await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('update-progress-light.png') });
    await page.getByRole('button', { name: '返回工作台' }).click();
    const notice = page.getByRole('region', { name: '更新提醒', exact: true });
    await expect(notice.getByRole('button', { name: '重启并安装' })).toBeVisible();
    await notice.getByRole('button', { name: '重启并安装' }).click();
    await expect(notice.getByRole('status')).toContainText('等待重启安装');
    await expect(notice.getByRole('button', { name: '重启并安装' })).toBeFocused();
    expect(app.windows()).toHaveLength(1);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark Mode', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 640));
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('update-downloaded-dark-compact.png') });
    await page.getByRole('button', { name: '内网地址', exact: true }).click();
    await page.getByLabel('req_from', { exact: true }).fill('unsaved-setting');
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await notice.getByRole('button', { name: '重启并安装' }).click();
    await expect(notice.getByRole('alert')).toContainText('设置尚未保存');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
  expect(await readFile(audit, 'utf8')).toBe('0');
});

test('confirmed installation saves writing and closes the window before handing off to the installer', async () => {
  const folder = test.info().outputPath('writing');
  const document = join(folder, '初稿.md');
  await mkdir(folder, { recursive: true });
  await writeFile(document, '# 原稿');
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await simulate(app, 'ready', test.info().outputPath('installed.txt'));
    await page.reload();
    await page
      .getByRole('region', { name: '更新提醒' })
      .getByRole('button', { name: '下载更新' })
      .click();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, folder);
    await page.getByRole('button', { name: '写作空间', exact: true }).click();
    await page.getByRole('button', { name: '打开本地文件夹', exact: true }).click();
    await page
      .getByRole('navigation', { name: '文件列表' })
      .getByRole('button', { name: '初稿.md', exact: true })
      .click();
    const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' });
    await editor.fill('# 更新前必须保存');
    const installed = app.evaluate(
      ({ ipcMain }) =>
        new Promise<boolean>((resolve) =>
          ipcMain.once('test-update-installed', (closed: unknown) => resolve(closed === true)),
        ),
    );
    await page
      .getByRole('region', { name: '更新提醒' })
      .getByRole('button', { name: '重启并安装' })
      .click();
    expect(await installed).toBe(true);
    expect(await readFile(document, 'utf8')).toBe('# 更新前必须保存');
    expect(app.windows()).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('installer handoff failure reopens the application with a retryable error', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await simulate(app, 'installer-error', test.info().outputPath('installed.txt'));
    await page.reload();
    const notice = page.getByRole('region', { name: '更新提醒', exact: true });
    await notice.getByRole('button', { name: '下载更新' }).click();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    const reopened = app.waitForEvent('window');
    await notice.getByRole('button', { name: '重启并安装' }).click();
    const restored = await reopened;
    await expect(
      restored.getByRole('region', { name: '更新提醒' }).getByRole('alert'),
    ).toContainText('测试安装器启动失败');
    await expect(
      restored
        .getByRole('region', { name: '更新提醒' })
        .getByRole('button', { name: '重启并安装' }),
    ).toBeEnabled();
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
});

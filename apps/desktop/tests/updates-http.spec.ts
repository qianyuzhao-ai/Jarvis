import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { stringify } from 'yaml';
import { launchUpdateApp } from './update-fixtures';

test('real updater downloads through HTTP, reports progress, rejects a bad hash and retries into an isolated cache', async () => {
  test.setTimeout(45_000);
  const profile = test.info().outputPath('profile');
  await mkdir(profile, { recursive: true });
  const mac = process.platform === 'darwin';
  const name = mac
    ? `Jarvis-0.1.9-macos-${process.arch}.zip`
    : 'Jarvis-0.1.9-windows-x64-unsigned-setup.exe';
  const bytes = Buffer.alloc(3 * 1024 * 1024, 11);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  let tamper = true;
  let downloads = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    if (path.endsWith('.yml')) {
      response.writeHead(200, { 'content-type': 'text/yaml' });
      response.end(
        stringify({
          version: '0.1.9',
          files: [{ url: name, size: bytes.length, sha512 }],
          path: name,
          sha512,
          releaseDate: new Date().toISOString(),
        }),
      );
    } else if (path === '/' + name) {
      downloads++;
      const payload = tamper ? Buffer.alloc(bytes.length, 12) : bytes;
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': bytes.length,
      });
      let offset = 0;
      const timer = setInterval(() => {
        response.write(payload.subarray(offset, offset + 32768));
        offset += 32768;
        if (offset >= payload.length) {
          clearInterval(timer);
          response.end();
        }
      }, 20);
      response.once('close', () => clearInterval(timer));
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Update fixture did not start');
  const url = `http://127.0.0.1:${address.port}`;
  const config = join(profile, 'update.yml');
  await writeFile(
    config,
    stringify({ provider: 'generic', url, updaterCacheDirName: 'isolated-updates' }),
  );
  const app = await launchUpdateApp();
  try {
    const page = await app.firstWindow();
    await app.evaluate(
      async ({ app }, input) => {
        const require = process
          .getBuiltinModule('node:module')
          .createRequire(app.getAppPath() + '/package.json');
        const entry = require(app.getAppPath() + '/tests/fixtures/updates-main.cjs');
        const { MacUpdater, NsisUpdater } = require('electron-updater');
        const adapter = {
          version: '0.1.8',
          name: 'Jarvis',
          isPackaged: true,
          appUpdateConfigPath: input.config,
          userDataPath: input.profile,
          baseCachePath: input.profile + '/cache',
          whenReady: async () => {},
          relaunch() {},
          quit() {},
          onQuit() {},
        };
        const updater =
          process.platform === 'darwin'
            ? new MacUpdater(undefined, adapter)
            : new NsisUpdater(undefined, adapter);
        updater.httpExecutor =
          new (require('electron-updater/out/electronHttpExecutor').ElectronHttpExecutor)();
        updater.setFeedURL({ provider: 'generic', url: input.url });
        entry.configureUpdates(entry.createElectronBackend(updater));
      },
      { config, profile, url },
    );
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '关于 Jarvis', exact: true }).click();
    const panel = page.getByRole('region', { name: '应用更新', exact: true });
    await panel.getByRole('button', { name: '检查更新' }).click();
    await expect(panel.getByRole('button', { name: '下载更新' })).toBeVisible();
    expect(downloads).toBe(0);
    await panel.getByRole('button', { name: '下载更新' }).click();
    await expect
      .poll(async () => Number(await panel.getByRole('progressbar').getAttribute('aria-valuenow')))
      .toBeGreaterThan(0);
    await expect(panel.getByRole('alert')).toContainText('完整性或签名校验失败');
    tamper = false;
    await panel.getByRole('button', { name: '重试下载' }).click();
    await expect(panel.getByRole('button', { name: '重启并安装' })).toBeVisible({
      timeout: 15_000,
    });
    const cache = join(profile, 'cache', 'isolated-updates');
    const downloaded = (await readdir(cache, { recursive: true })).find((path) =>
      path.endsWith(mac ? '.zip' : '.exe'),
    );
    expect(downloaded).toBeTruthy();
    expect(
      createHash('sha512')
        .update(await readFile(join(cache, downloaded!)))
        .digest('base64'),
    ).toBe(sha512);
    expect(downloads).toBeGreaterThanOrEqual(2);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

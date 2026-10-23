import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect } from '@playwright/test';

const directory = resolve(process.argv[2]);
const arch = process.argv[3] ?? process.arch;
assert(['arm64', 'x64'].includes(arch), 'Unsupported package architecture');
assert.equal(process.arch, arch, 'Run with the matching process architecture');
const mac = process.platform === 'darwin';
assert(mac || process.platform === 'win32', 'Run on the packaged application platform');
const application = mac
  ? join(directory, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Jarvis.app/Contents')
  : join(directory, 'win-unpacked');
const executable = join(application, mac ? 'MacOS/Jarvis' : 'Jarvis.exe');
const archive = join(application, mac ? 'Resources/app.asar' : 'resources/app.asar');
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !['ELECTRON_RUN_AS_NODE', 'NODE_PATH', 'NODE_OPTIONS', 'ELECTRON_RENDERER_URL'].includes(key),
  ),
);
const dependencies = spawnSync(
  executable,
  [join(import.meta.dirname, 'verify-packaged-dependencies.cjs'), archive],
  {
    cwd: tmpdir(),
    env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  },
);
assert.equal(dependencies.status, 0, dependencies.stderr || String(dependencies.error));
console.log(dependencies.stdout.trim());

const profile = await mkdtemp(join(tmpdir(), 'jarvis-packaged-smoke-'));
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const instance = await electron.launch({
  executablePath: executable,
  args: [`--user-data-dir=${profile}`],
  cwd: tmpdir(),
  env: environment,
  timeout: 30_000,
});
let stderr = '';
instance.process().stderr?.on('data', (data) => {
  stderr = (stderr + data).slice(-32_768);
});
try {
  const page = await instance.firstWindow();
  await page.locator('.theme-root').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('load');
  const info = await instance.evaluate(({ app }) => ({
    arch: process.arch,
    packaged: app.isPackaged,
    version: app.getVersion(),
    path: app.getAppPath(),
    profile: app.getPath('userData'),
  }));
  assert.equal(info.arch, arch);
  assert.equal(info.packaged, true);
  assert.equal(info.version, version);
  assert.equal(await realpath(info.path), await realpath(archive));
  assert.equal(await realpath(info.profile), await realpath(profile));
  assert(page.url().includes('app.asar/out/renderer/index.html'));
  const state = await page.evaluate(() => window.desktop.updates.getState());
  assert.equal(state.ok, true);
  assert.equal(state.value.currentVersion, version);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '通用设置', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '应用更新', exact: true })).toBeVisible();
  console.log(
    `Verified packaged ${process.platform} startup, ASAR renderer and updater bridge: ${version}`,
  );
} catch (error) {
  console.error(stderr);
  throw error;
} finally {
  await instance.close();
}

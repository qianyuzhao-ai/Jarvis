import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect } from '@playwright/test';

const directory = resolve(process.argv[2]);
const mac = process.platform === 'darwin';
assert(mac || process.platform === 'win32', 'Run on the packaged application platform');
const application = mac
  ? join(directory, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Jarvis.app/Contents')
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
    timeout: 30000,
  },
);
assert.equal(dependencies.status, 0, dependencies.stderr || String(dependencies.error));
console.log(dependencies.stdout.trim());
const profile = await mkdtemp(join(tmpdir(), 'jarvis-packaged-writing-'));
const folder = join(profile, 'notes');
await mkdir(folder);
const rich = process.argv.includes('--rich');
await writeFile(
  join(folder, 'package.md'),
  '# 打包验证\n\n原始内容\n' +
    (rich
      ? '\n```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```\n\n```mindmap\n- 打包导图\n  - 分支\n```\n'
      : ''),
);
const instance = await electron.launch({
  executablePath: executable,
  args: [`--user-data-dir=${join(profile, 'profile')}`],
  cwd: tmpdir(),
  env: environment,
});
try {
  const page = await instance.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await instance.evaluate(({ dialog, BrowserWindow }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  }, folder);
  await page.getByRole('button', { name: '写作空间', exact: true }).click();
  await page.getByRole('button', { name: '打开本地文件夹' }).click();
  await page
    .getByRole('navigation', { name: '文件列表' })
    .getByRole('button', { name: 'package.md', exact: true })
    .click();
  const editor = page.getByRole('textbox', { name: '块编辑器' });
  await expect(editor).toContainText('原始内容');
  if (rich) {
    await expect(page.getByTestId('writing-mermaid').getByRole('img').locator('svg')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('writing-mindmap')).toContainText('打包导图');
  }
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText('打包块编辑通过');
  await editor.press('ControlOrMeta+s');
  await expect.poll(() => readFile(join(folder, 'package.md'), 'utf8')).toContain('打包块编辑通过');
  const screenshot = join(profile, 'writing-blocks.png');
  await page.screenshot({ path: screenshot });
  const graph = process.argv.includes('--graph');
  if (graph) {
    await page.getByRole('tab', { name: '星图', exact: true }).click();
    const mini = page.getByTestId('writing-graph-mini');
    await expect(mini.locator('.react-flow__node').first()).toBeVisible();
    await mini.getByRole('button', { name: '在编辑区展开全景' }).click();
    await expect(page.getByTestId('writing-graph-full')).toContainText('1 个点');
    await page.screenshot({ path: join(profile, 'writing-graph.png') });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      version: await instance.evaluate(({ app }) => app.getVersion()),
      blockEditor: true,
      richPreviews: rich,
      graph,
      persisted: true,
      screenshot,
    }),
  );
} finally {
  await instance.close();
}

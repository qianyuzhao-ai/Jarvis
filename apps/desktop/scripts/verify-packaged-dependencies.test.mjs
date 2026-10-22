import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./verify-packaged-dependencies.cjs', import.meta.url));
async function manifest(directory, name, dependencies = {}, optionalDependencies = {}) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name, dependencies, optionalDependencies }),
  );
}

test('verifies nested production dependencies, builtin modules and absent optional packages', async () => {
  const archive = await mkdtemp(join(tmpdir(), 'jarvis-dependency-pass-'));
  await manifest(archive, 'app', { updater: '1' });
  const updater = join(archive, 'node_modules/updater');
  await manifest(updater, 'updater', { debug: '1', fs: '*', optional: '1' }, { optional: '1' });
  await manifest(join(updater, 'node_modules/debug'), 'debug');
  const result = spawnSync(process.execPath, [checker, archive], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified 3 packaged/);
});

test('rejects a missing transitive dependency even when the build workspace could resolve it', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'jarvis-dependency-fail-'));
  const archive = join(workspace, 'app.asar');
  await manifest(archive, 'app', { updater: '1' });
  await manifest(join(archive, 'node_modules/updater'), 'updater', { debug: '1' });
  await manifest(join(workspace, 'node_modules/debug'), 'debug');
  const result = spawnSync(process.execPath, [checker, archive], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing packaged dependency: updater -> debug/);
});

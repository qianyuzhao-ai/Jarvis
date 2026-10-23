import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { parse, stringify } from 'yaml';
import { assembleReleaseAssets } from './assemble-release-assets.mjs';

const { MacUpdater } = createRequire(import.meta.url)('electron-updater/out/MacUpdater.js');
async function fixture(change = () => {}, version = '0.2.5') {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-combined-assets-'));
  const channel = version.includes('-') ? 'beta' : 'latest';
  for (const [platform, arch] of [
    ['macos', 'arm64'],
    ['macos', 'x64'],
    ['windows', 'x64'],
  ]) {
    const directory = join(root, `Jarvis-${platform}-${arch}-123`, `github-${version}`);
    await mkdir(directory, { recursive: true });
    const names =
      platform === 'macos'
        ? [`Jarvis-${version}-macos-${arch}.zip`, `Jarvis-${version}-macos-${arch}.dmg`]
        : [`Jarvis-${version}-windows-x64-unsigned-setup.exe`];
    const files = [];
    for (const name of names) {
      const bytes = Buffer.from(name);
      await writeFile(join(directory, name), bytes);
      await writeFile(join(directory, `${name}.blockmap`), 'blockmap fixture');
      files.push({
        url: name,
        size: bytes.length,
        sha512: createHash('sha512').update(bytes).digest('base64'),
      });
    }
    const info = { version, files, path: files[0].url, sha512: files[0].sha512 };
    change(info, platform, arch);
    await writeFile(
      join(directory, `${channel}${platform === 'macos' ? '-mac' : ''}.yml`),
      stringify(info),
    );
  }
  return { root, output: join(root, 'combined'), version, channel };
}

test('combined metadata selects the correct ZIP using the installed MacUpdater', async () => {
  for (const version of ['0.2.5', '0.2.5-beta.1']) {
    const f = await fixture(undefined, version);
    await assembleReleaseAssets(f.root, f.output, f.version, '123');
    const info = parse(await readFile(join(f.output, `${f.channel}-mac.yml`), 'utf8'));
    assert.equal(info.files.length, 4);
    assert.match(info.path, /macos-x64.zip$/);
    const files = info.files.map((file) => ({
      url: new URL(file.url, 'https://example.com/'),
      info: file,
    }));
    for (const [arm, arch] of [
      [true, 'arm64'],
      [false, 'x64'],
    ]) {
      const chosen = MacUpdater.filterFilesForArch(files, arm).find((file) =>
        file.url.pathname.endsWith('.zip'),
      );
      assert.equal(chosen.info.url, `Jarvis-${version}-macos-${arch}.zip`);
    }
    await assert.rejects(assembleReleaseAssets(f.root, f.output, f.version, '123'), /EEXIST/);
  }
});

test('missing architecture, wrong version, hash corruption and missing ZIP are rejected', async () => {
  const missing = await fixture();
  await rename(join(missing.root, 'Jarvis-macos-x64-123'), join(missing.root, 'missing-x64'));
  await assert.rejects(
    assembleReleaseAssets(missing.root, missing.output, missing.version, '123'),
    /ENOENT/,
  );
  for (const change of [
    (info) => {
      info.version = '0.0.0';
    },
    (info) => {
      info.files[0].sha512 = 'bad';
    },
    (info) => {
      info.files = info.files.filter((file) => !file.url.endsWith('.zip'));
      delete info.path;
      delete info.sha512;
    },
  ]) {
    const f = await fixture((info, platform, arch) => {
      if (platform === 'macos' && arch === 'x64') change(info);
    });
    await assert.rejects(assembleReleaseAssets(f.root, f.output, f.version, '123'));
  }
});

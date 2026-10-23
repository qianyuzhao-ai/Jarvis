import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { verifyUpdateMetadata } from './verify-update-metadata.mjs';

export async function assembleReleaseAssets(root, output, version, runId) {
  const sources = [
    ['macos', 'arm64'],
    ['macos', 'x64'],
    ['windows', 'x64'],
  ];
  const manifests = new Map();
  await mkdir(output, { recursive: true });
  for (const [platform, arch] of sources) {
    const directory = join(root, `Jarvis-${platform}-${arch}-${runId}`, `github-${version}`);
    await verifyUpdateMetadata(directory, platform, version, arch);
    const names = await readdir(directory);
    const packages =
      platform === 'macos'
        ? [`Jarvis-${version}-macos-${arch}.dmg`, `Jarvis-${version}-macos-${arch}.zip`]
        : [`Jarvis-${version}-windows-x64-unsigned-setup.exe`];
    for (const name of packages) {
      await copyFile(join(directory, name), join(output, name), constants.COPYFILE_EXCL);
      if (names.includes(`${name}.blockmap`)) {
        await copyFile(
          join(directory, `${name}.blockmap`),
          join(output, `${name}.blockmap`),
          constants.COPYFILE_EXCL,
        );
      }
    }
    for (const name of names.filter(
      (name) => name.endsWith('.yml') && !name.startsWith('builder-'),
    )) {
      const info = parse(await readFile(join(directory, name), 'utf8'));
      const entries = manifests.get(name) ?? [];
      entries.push({ arch, info });
      manifests.set(name, entries);
    }
  }
  for (const [name, entries] of manifests) {
    const mac = name.endsWith('-mac.yml');
    assert.equal(
      entries.length,
      mac ? 2 : 1,
      `Missing or duplicate architecture manifest: ${name}`,
    );
    const base = entries.find((entry) => entry.arch === 'x64').info;
    const files = entries.flatMap((entry) => entry.info.files);
    assert.equal(
      new Set(files.map((file) => file.url)).size,
      files.length,
      `Duplicate update file: ${name}`,
    );
    await writeFile(join(output, name), stringify({ ...base, files }), { flag: 'wx' });
  }
  // Validate each platform independently because the final directory contains both manifests.
  for (const [platform, arch] of sources) {
    await verifyUpdateMetadata(output, platform, version, arch, true);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output, version, runId] = process.argv.slice(2);
  assert(
    root && output && version && runId,
    'Usage: assemble-release-assets.mjs <downloads> <output> <version> <run-id>',
  );
  await assembleReleaseAssets(resolve(root), resolve(output), version, runId);
  console.log('Verified combined release assets and both macOS update architectures');
}

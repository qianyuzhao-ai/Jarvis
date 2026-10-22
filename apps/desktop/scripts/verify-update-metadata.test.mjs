import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { verifyUpdateMetadata } from './verify-update-metadata.mjs';

async function fixture(change = (info) => info, platform = 'macos') {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-update-metadata-'));
  const name =
    platform === 'macos'
      ? 'Jarvis-0.1.9-macos-arm64.zip'
      : 'Jarvis-0.1.9-windows-x64-unsigned-setup.exe';
  const bytes = Buffer.from('verified update archive');
  await writeFile(join(directory, name), bytes);
  const info = {
    version: '0.1.9',
    files: [
      {
        url: name,
        size: bytes.length,
        sha512: createHash('sha512').update(bytes).digest('base64'),
      },
    ],
  };
  await writeFile(
    join(directory, platform === 'macos' ? 'latest-mac.yml' : 'latest.yml'),
    stringify(change(info)),
  );
  return directory;
}

test('metadata verifies real file bytes, size and version', async () => {
  const directory = await fixture();
  await writeFile(
    join(directory, 'builder-debug.yml'),
    'build diagnostics, not an update manifest',
  );
  await verifyUpdateMetadata(directory, 'macos', '0.1.9');
  await verifyUpdateMetadata(await fixture(undefined, 'windows'), 'windows', '0.1.9');
});
test('tampered archive, missing archive, wrong version and traversal cannot pass', async () => {
  const tampered = await fixture();
  await writeFile(join(tampered, 'Jarvis-0.1.9-macos-arm64.zip'), 'different bytes');
  await assert.rejects(verifyUpdateMetadata(tampered, 'macos', '0.1.9'), /mismatch/);
  const missing = await fixture((info) => ({
    ...info,
    files: [{ ...info.files[0], url: 'missing.zip' }],
  }));
  await assert.rejects(verifyUpdateMetadata(missing, 'macos', '0.1.9'), /ENOENT/);
  await assert.rejects(verifyUpdateMetadata(await fixture(), 'macos', '0.2.0'), /version/);
  const traversal = await fixture((info) => ({
    ...info,
    files: [{ ...info.files[0], url: '../escape.zip' }],
  }));
  await assert.rejects(verifyUpdateMetadata(traversal, 'macos', '0.1.9'), /Unsafe/);
});
test('hash mismatch is rejected even when the file size is unchanged', async () => {
  const directory = await fixture((info) => ({
    ...info,
    files: [{ ...info.files[0], sha512: 'invalid' }],
  }));
  await assert.rejects(verifyUpdateMetadata(directory, 'macos', '0.1.9'), /SHA-512/);
});

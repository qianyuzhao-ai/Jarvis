import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export async function verifyUpdateMetadata(
  directory,
  platform,
  version,
  arch = platform === 'macos' ? 'arm64' : 'x64',
  combined = false,
) {
  if (!['arm64', 'x64'].includes(arch) || (platform === 'windows' && arch !== 'x64'))
    throw new Error(`Unsupported update architecture: ${arch}`);
  const manifests = (await readdir(directory)).filter(
    (name) =>
      name.endsWith('.yml') &&
      !name.startsWith('builder-') &&
      (!combined || name.endsWith('-mac.yml') === (platform === 'macos')),
  );
  if (!manifests.length) throw new Error('Missing update metadata');
  const withoutBuild = version.split('+')[0];
  const separator = withoutBuild.indexOf('-');
  const channel = separator < 0 ? 'latest' : withoutBuild.slice(separator + 1).split('.')[0];
  const manifest = `${channel}${platform === 'macos' ? '-mac' : ''}.yml`;
  if (!manifests.includes(manifest))
    throw new Error(`Missing platform update metadata: ${manifest}`);
  const expected =
    platform === 'macos'
      ? `Jarvis-${version}-macos-${arch}.zip`
      : `Jarvis-${version}-windows-x64-unsigned-setup.exe`;
  let found = false;
  for (const name of manifests) {
    if (name.endsWith('-mac.yml') !== (platform === 'macos'))
      throw new Error(`Unexpected platform manifest: ${name}`);
    const info = parse(await readFile(join(directory, name), 'utf8'));
    if (info?.version !== version || !Array.isArray(info.files) || !info.files.length)
      throw new Error(`Invalid update version or files: ${name}`);
    const checked = new Map();
    for (const file of info.files) {
      if (typeof file.url !== 'string' || typeof file.sha512 !== 'string')
        throw new Error(`Missing URL or SHA-512: ${name}`);
      const path = decodeURIComponent(file.url);
      if (basename(path) !== path || /[\\/]/.test(path) || path === '.' || path === '..')
        throw new Error(`Unsafe update file: ${path}`);
      const target = join(directory, path);
      const size = (await stat(target)).size;
      if (!size || size !== file.size) throw new Error(`Update size mismatch: ${path}`);
      const hash = createHash('sha512');
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      const digest = hash.digest('base64');
      if (digest !== file.sha512) throw new Error(`Update SHA-512 mismatch: ${path}`);
      checked.set(path, digest);
      if (path === expected) found = true;
    }
    if (info.path && (!checked.has(info.path) || info.sha512 !== checked.get(info.path)))
      throw new Error(`Legacy update path/hash mismatch: ${name}`);
  }
  if (!found) throw new Error(`Required update target missing: ${expected}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, platform, arch] = process.argv.slice(2);
  if (!directory || !['macos', 'windows'].includes(platform))
    throw new Error('Usage: verify-update-metadata.mjs <directory> <macos|windows> [arm64|x64]');
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  await verifyUpdateMetadata(resolve(directory), platform, version, arch);
  console.log(`Verified ${platform} update metadata: version, target, size and SHA-512`);
}

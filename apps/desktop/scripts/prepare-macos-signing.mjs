import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function security(args, secrets) {
  const result = spawnSync('/usr/bin/security', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    let detail = result.stderr || `exit ${result.status}`;
    for (const secret of secrets) detail = detail.replaceAll(secret, '***');
    throw new Error(`security ${args[0]} failed: ${detail.trim()}`);
  }
  return result.stdout;
}

export function prepareSigningKeychain(
  { certificate, password, teamId, directory },
  run = security,
) {
  if (!certificate || !password || !directory || !/^[A-Z0-9]{10}$/.test(teamId || ''))
    throw new Error(
      'Missing signing certificate/password/temporary directory or invalid Apple team ID',
    );
  const encoded = certificate.replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, ''))
    throw new Error('CSC_LINK must contain the base64-encoded .p12 certificate');

  const name = `jarvis-signing-${randomUUID()}`;
  const keychain = join(directory, `${name}.keychain-db`);
  const certificatePath = join(directory, `${name}.p12`);
  const keychainPassword = randomBytes(32).toString('hex');
  const secrets = [certificate, password, keychainPassword];
  const execute = (args) => run(args, secrets);
  writeFileSync(certificatePath, bytes, { mode: 0o600, flag: 'wx' });
  try {
    execute(['create-keychain', '-p', keychainPassword, keychain]);
    execute(['set-keychain-settings', '-lut', '21600', keychain]);
    execute(['unlock-keychain', '-p', keychainPassword, keychain]);
    execute([
      'import',
      certificatePath,
      '-k',
      keychain,
      '-P',
      password,
      '-T',
      '/usr/bin/codesign',
      '-T',
      '/usr/bin/productbuild',
    ]);
    execute([
      'set-key-partition-list',
      '-S',
      'apple-tool:,apple:',
      '-s',
      '-k',
      keychainPassword,
      keychain,
    ]);
    const identities = execute(['find-identity', '-v', '-p', 'codesigning', keychain]);
    if (
      !identities
        .split('\n')
        .some((line) => line.includes('Developer ID Application:') && line.includes(`(${teamId})`))
    )
      throw new Error('No valid Developer ID Application identity for the configured Apple team');
    const existing = [...execute(['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)].map(
      (match) => match[1],
    );
    execute([
      'list-keychains',
      '-d',
      'user',
      '-s',
      keychain,
      ...existing.filter((path) => path !== keychain),
    ]);
    return keychain;
  } finally {
    unlinkSync(certificatePath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required');
  const keychain = prepareSigningKeychain({
    certificate: process.env.CSC_LINK,
    password: process.env.CSC_KEY_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
    directory: process.env.RUNNER_TEMP,
  });
  appendFileSync(process.env.GITHUB_ENV, `CSC_KEYCHAIN=${keychain}\n`);
  console.log('Prepared Developer ID Application signing keychain');
}

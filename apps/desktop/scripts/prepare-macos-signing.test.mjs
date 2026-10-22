import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareSigningKeychain } from './prepare-macos-signing.mjs';

function fixture() {
  return {
    certificate: Buffer.from('test-p12-bytes').toString('base64'),
    password: 'p12-password',
    teamId: 'ABCDE12345',
    directory: mkdtempSync(join(tmpdir(), 'jarvis-signing-test-')),
  };
}

test('imports with the certificate password and configures access with the separate keychain password', () => {
  const input = fixture();
  const commands = [];
  let certificatePath;
  const keychain = prepareSigningKeychain(input, (args) => {
    commands.push(args);
    if (args[0] === 'import') {
      certificatePath = args[1];
      assert.equal(readFileSync(certificatePath, 'utf8'), 'test-p12-bytes');
    }
    if (args[0] === 'find-identity') return '1) HASH "Developer ID Application: Test (ABCDE12345)"';
    if (args[0] === 'list-keychains') return '"/Users/runner/Library/Keychains/login.keychain-db"';
    return '';
  });
  const secret = commands.find((args) => args[0] === 'create-keychain')[2];
  assert.notEqual(secret, input.password);
  const imported = commands.find((args) => args[0] === 'import');
  assert.equal(imported[imported.indexOf('-P') + 1], input.password);
  const partition = commands.find((args) => args[0] === 'set-key-partition-list');
  assert.equal(partition[partition.indexOf('-k') + 1], secret);
  assert.deepEqual(commands.at(-1), [
    'list-keychains',
    '-d',
    'user',
    '-s',
    keychain,
    '/Users/runner/Library/Keychains/login.keychain-db',
  ]);
  assert.equal(existsSync(certificatePath), false);
});

test('rejects a missing team identity and removes the temporary certificate on failure', () => {
  const input = fixture();
  let certificatePath;
  assert.throws(
    () =>
      prepareSigningKeychain(input, (args) => {
        if (args[0] === 'import') certificatePath = args[1];
        return '';
      }),
    /No valid Developer ID/,
  );
  assert.equal(existsSync(certificatePath), false);
});

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { build, Platform } from 'electron-builder';

const output = resolve(import.meta.dirname, '../../..', 'release', randomUUID());

await build({
  targets: Platform.current().createTarget('dir'),
  publish: 'never',
  config: {
    extends: resolve(import.meta.dirname, '../electron-builder.yml'),
    directories: { output },
  },
});

console.log(`Local package: ${output}`);

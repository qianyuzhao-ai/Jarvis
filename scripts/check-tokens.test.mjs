import assert from 'node:assert/strict';
import { test } from 'node:test';
import { violations } from './check-tokens.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
test('rejects literal colors and arbitrary utility values without rejecting variable classes', () => {
  assert.deepEqual(violations('bg-surface text-fg p-2 h-(--control-h-regular)'), []);
  assert.deepEqual(violations('color: #fff; rgb(1, 2, 3); hsl(0 0% 0%); p-[13px] bg-[#fff]'), [
    '#fff',
    'rgb(1, 2, 3)',
    'hsl(0 0% 0%)',
    'p-[13px]',
    'bg-[#fff]',
  ]);
});

for (const windows of [false, true]) {
  test(`full checker preserves allowlists and boundary checks with ${windows ? 'Windows' : 'POSIX'} paths`, () => {
    const script = readFileSync(new URL('./check-tokens.mjs', import.meta.url), 'utf8')
      .replace(/^import .*;\n/gm, '')
      .replace('export function', 'function')
      .replace('import.meta.dirname', JSON.stringify(import.meta.dirname));
    const run = (injectViolation) => {
      const errors = [];
      const outcome = {};
      runInNewContext(script, {
        resolve,
        relative: (from, to) => {
          const path = relative(from, to);
          return windows ? path.replaceAll('/', '\\') : path;
        },
        readdirSync,
        readFileSync: (path, encoding) => {
          const source = readFileSync(path, encoding);
          return injectViolation &&
            path === resolve(import.meta.dirname, '../packages/ui/src/components/Button.tsx')
            ? `${source}\nimport fs from 'node:fs';\nconst color = '#123456';\n`
            : source;
        },
        process: outcome,
        console: { log() {}, error: (message) => errors.push(message) },
      });
      return { errors, exitCode: outcome.exitCode };
    };
    assert.deepEqual(run(false), { errors: [], exitCode: undefined });
    const rejected = run(true);
    assert.equal(rejected.exitCode, 1);
    assert.match(rejected.errors.join('\n'), /Button\.tsx: #123456/);
    assert.match(rejected.errors.join('\n'), /UI package crosses application boundary/);
  });
}

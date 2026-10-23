import assert from 'node:assert/strict';
import { test } from 'node:test';
import { violations } from './check-tokens.mjs';
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

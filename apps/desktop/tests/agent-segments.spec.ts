import { expect, test } from '@playwright/test';
import { groupByDay } from '../src/renderer/src/features/shell/conversation-groups';

test('home conversations group by local day, newest first, without empty groups', () => {
  const now = new Date(2026, 9, 25, 15, 0).getTime();
  const at = (days: number, hour = 9) => new Date(2026, 9, 25 - days, hour).getTime();
  const items = [
    { id: 'old', updatedAt: at(30) },
    { id: 'week', updatedAt: at(3) },
    { id: 'yesterday-late', updatedAt: at(1, 23) },
    { id: 'today-early', updatedAt: at(0, 0) },
    { id: 'today', updatedAt: at(0, 14) },
  ];
  expect(groupByDay(items, now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
    ['今天', ['today', 'today-early']],
    ['昨天', ['yesterday-late']],
    ['最近 7 天', ['week']],
    ['更早', ['old']],
  ]);
  expect(groupByDay([{ id: 'x', updatedAt: at(0) }], now).map((g) => g.label)).toEqual(['今天']);
});

const DAY = 24 * 60 * 60 * 1000;

/**
 * Groups home conversations by the local day of their last activity, newest first: today,
 * yesterday, the previous seven days and earlier. Empty groups are left out.
 */
export function groupByDay<T extends { updatedAt: number }>(items: T[], now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const groups = [
    { label: '今天', from: start, items: [] as T[] },
    { label: '昨天', from: start - DAY, items: [] as T[] },
    { label: '最近 7 天', from: start - 7 * DAY, items: [] as T[] },
    { label: '更早', from: Number.NEGATIVE_INFINITY, items: [] as T[] },
  ];
  for (const item of [...items].sort((a, b) => b.updatedAt - a.updatedAt))
    groups.find((g) => item.updatedAt >= g.from)?.items.push(item);
  return groups.filter((g) => g.items.length).map(({ label, items }) => ({ label, items }));
}

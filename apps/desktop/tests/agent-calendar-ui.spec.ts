import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';
import { osRelay } from './helpers/os-relay';
import { approveInOverview } from './helpers/os-ui';

/** Today at a local hour, as ISO 8601 with the local offset. */
function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  const offset = -date.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19)}${offset >= 0 ? '+' : '-'}${pad(offset / 60)}:${pad(offset % 60)}`;
}

test('the calendar view shows the week and an event Jarvis booked after the user approved it', async () => {
  test.setTimeout(60000);
  const { server, url } = await osRelay({
    title: '约小王开会',
    capabilities: ['calendar'],
    steps: [
      () => [
        'create_event',
        { title: '和小王开会', start: todayAt(15), end: todayAt(16), location: '会议室 A' },
      ],
    ],
    done: '已约好今天下午三点。',
  });
  const app = await electron.launch({
    args: [
      resolve(import.meta.dirname, '..'),
      `--user-data-dir=${test.info().outputPath('profile')}`,
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    await addRelayModel(page, { baseUrl: url, model: 'mock' });
    await page.reload();

    await page.getByRole('button', { name: '日历', exact: true }).click();
    const view = page.getByTestId('calendar-space');
    await expect(view.getByRole('heading', { name: '日历' })).toBeVisible();
    await expect(view).toContainText('Jarvis 日历');
    await expect(view.getByTestId('calendar-day')).toHaveCount(7);
    await expect(view.getByTestId('calendar-event')).toHaveCount(0);

    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByLabel('消息', { exact: true }).fill('今天下午三点和小王开会');
    await page.getByRole('button', { name: '发送消息' }).click();
    // A thread does the booking; the irreversible step waits on a decision card.
    await approveInOverview(page, ['新建日程', '和小王开会']);
    await expect(page.getByText('已约好今天下午三点。')).toBeVisible();

    await page.getByRole('button', { name: '日历', exact: true }).click();
    const event = view.getByTestId('calendar-event');
    await expect(event).toHaveCount(1);
    await expect(event).toContainText('15:00–16:00');
    await expect(event).toContainText('和小王开会');
    await expect(event).toContainText('会议室 A');
    await page.screenshot({ path: test.info().outputPath('calendar-week.png') });
    await view.getByRole('button', { name: '下一周' }).click();
    await expect(view.getByTestId('calendar-event')).toHaveCount(0);
    await view.getByRole('button', { name: '本周' }).click();
    await expect(view.getByTestId('calendar-event')).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

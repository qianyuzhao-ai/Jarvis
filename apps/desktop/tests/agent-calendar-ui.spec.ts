import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { addRelayModel } from './helpers/model-setup';

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
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const userIndex = body.messages.findLastIndex((m: { role: string }) => m.role === 'user');
    const step = body.messages
      .slice(userIndex + 1)
      .filter((m: { role: string }) => m.role === 'tool').length;
    const steps: [string, unknown][] = [
      [
        'create_event',
        { title: '和小王开会', start: todayAt(15), end: todayAt(16), location: '会议室 A' },
      ],
    ];
    const next = steps[step];
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      (next
        ? chunk({
            tool_calls: [
              {
                index: 0,
                id: randomUUID(),
                type: 'function',
                function: { name: next[0], arguments: JSON.stringify(next[1]) },
              },
            ],
          }) + chunk({}, 'tool_calls')
        : chunk({ content: '已约好今天下午三点。' }) + chunk({}, 'stop')) + 'data: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
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
    await addRelayModel(page, { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' });
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
    const approval = page.getByRole('alertdialog');
    await expect(approval).toContainText('新建日程');
    await expect(approval).toContainText('和小王开会');
    await approval.getByRole('button', { name: '允许' }).click();
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

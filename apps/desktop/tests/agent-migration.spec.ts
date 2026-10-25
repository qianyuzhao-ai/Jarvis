import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('an existing version 1 profile opens after the upgrade with its conversations intact', async () => {
  const profile = test.info().outputPath('profile');
  const root = join(profile, 'agent');
  await mkdir(root, { recursive: true });
  const id = randomUUID();
  await writeFile(
    join(root, 'index.json'),
    JSON.stringify({
      version: 1,
      sessions: [
        {
          view: {
            id,
            title: '升级前的对话',
            model: 'mock',
            modelId: randomUUID(),
            createdAt: 1,
            updatedAt: 2,
            runId: null,
            contextTokens: null,
            contextWindow: null,
            messages: [
              { id: randomUUID(), role: 'user', text: '升级前的问题', status: 'succeeded' },
              {
                id: randomUUID(),
                role: 'assistant',
                text: '升级前的回答🙂',
                status: 'succeeded',
                completedAt: 3,
              },
            ],
          },
        },
      ],
      requests: [],
    }),
  );
  const app = await electron.launch({
    args: [resolve(import.meta.dirname, '..'), `--user-data-dir=${profile}`],
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    ),
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '升级前的对话' }).first().click();
    await expect(page.getByText('升级前的回答🙂')).toBeVisible();
    await expect(page.getByText('升级前的问题')).toBeVisible();
    await access(join(root, 'index.v1.bak.json'));
    const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
    expect(index.version).toBe(2);
    expect(index.sessions[0].meta.agent).toEqual({ kind: 'main', origin: 'user' });
    await access(join(root, 'sessions', `${id}.view.json`));
    // The upgraded conversation sits in the date group of its last activity.
    const history = page.getByTestId('chat-history');
    await expect(history.getByRole('region', { name: '更早' })).toContainText('升级前的对话');
    await expect(history.getByRole('region', { name: '今天' })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

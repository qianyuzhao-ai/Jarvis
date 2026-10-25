import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ApprovalRequest } from '../src/shared/agent-approval';

test('approval dialog follows the main-process list, defaults to declining and closes on expiry', async () => {
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
    await page.getByRole('heading', { name: '先添加一个模型' }).waitFor();
    const request = (detail: string): ApprovalRequest => ({
      id: randomUUID(),
      sessionId: randomUUID(),
      toolName: 'remove_note',
      title: '删除便签',
      detail,
      expiresAt: Date.now() + 60_000,
    });
    // Stands in for the main-process approval queue pushing this window's pending list.
    const push = (list: ApprovalRequest[]) =>
      app.evaluate(({ BrowserWindow }, value) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('agent:approvals', value);
      }, list);
    const dialog = page.getByRole('alertdialog');

    await push([request('将删除便签 n1'), request('将删除便签 n2')]);
    await expect(dialog.getByText('允许 Jarvis 执行“删除便签”？')).toBeVisible();
    await expect(dialog.getByText('将删除便签 n1')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '拒绝' })).toBeFocused();
    await dialog.getByRole('button', { name: '允许' }).click();
    await expect(dialog.getByText('将删除便签 n2')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await push([request('将删除便签 n3')]);
    await expect(dialog.getByText('将删除便签 n3')).toBeVisible();
    await push([]);
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
  }
});

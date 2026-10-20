import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('sidebar resizes, persists width, animates and respects reduced motion', async () => {
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
    page.on('pageerror', (e) => errors.push(e.message));
    const handle = page.getByRole('separator', { name: '调整侧栏宽度' });
    await expect(handle).toHaveAttribute('aria-valuenow', '230');
    async function dragBy(delta: number) {
      const bounds = await handle.boundingBox();
      if (!bounds) throw new Error('Missing resize handle');
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + 160;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + delta, y, { steps: 10 });
      await page.mouse.up();
    }
    await dragBy(200);
    await expect(handle).toHaveAttribute('aria-valuenow', '320');
    await page.screenshot({ path: test.info().outputPath('sidebar-wide.png') });
    await dragBy(-200);
    await expect(handle).toHaveAttribute('aria-valuenow', '230');
    await dragBy(50);
    await expect(handle).toHaveAttribute('aria-valuenow', '280');
    await expect(page.locator('.save-status')).toHaveText('已保存到本机');
    await page.reload();
    await expect(handle).toHaveAttribute('aria-valuenow', '280');
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(handle).toHaveAttribute('aria-valuenow', '290');
    await handle.dblclick();
    await expect(handle).toHaveAttribute('aria-valuenow', '230');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const intermediate = await page.evaluate(async () => {
      (document.querySelector('[aria-label="收起侧栏"]') as HTMLButtonElement).click();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return document.querySelector('.sidebar-shell')!.getBoundingClientRect().x;
    });
    expect(intermediate).toBeLessThan(0);
    expect(intermediate).toBeGreaterThan(-230);
    // Reverse before the exit has completed.
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page.locator('.sidebar-shell').evaluate((n) => Math.round(n.getBoundingClientRect().x)),
      )
      .toBe(0);
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeFocused();
    await expect
      .poll(() =>
        page.locator('.workspace').evaluate((n) => Math.round(n.getBoundingClientRect().x)),
      )
      .toBe(0);
    await expect(page.locator('.sidebar-shell')).toHaveAttribute('inert', '');
    await page.screenshot({ path: test.info().outputPath('sidebar-collapsed.png') });
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect(page.getByRole('button', { name: '收起侧栏' })).toBeFocused();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(handle).toHaveAttribute('aria-valuenow', '230');
    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', '320');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect
      .poll(() =>
        page.locator('.sidebar-shell').evaluate((n) => Math.round(n.getBoundingClientRect().x)),
      )
      .toBe(-320);
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect
      .poll(() =>
        page.locator('.workspace').evaluate((n) => Math.round(n.getBoundingClientRect().x)),
      )
      .toBe(320);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

import { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('canvas assistant slides in and out, reverses, restores focus and respects reduced motion', async () => {
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
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    const sidebar = page.getByTestId('canvas-agent');
    const offset = () =>
      sidebar.evaluate((n) => new DOMMatrixReadOnly(getComputedStyle(n).transform).m41);
    await expect(sidebar).toBeHidden();
    const enter = await page.evaluate(async () => {
      (document.querySelector('[aria-label="展开画布助手"]') as HTMLButtonElement).click();
      const n = document.querySelector('[data-testid="canvas-agent"]')!;
      const deadline = performance.now() + 1500;
      while (performance.now() < deadline) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const x = new DOMMatrixReadOnly(getComputedStyle(n).transform).m41;
        if (x > 0 && x < n.clientWidth) break;
      }
      return {
        offset: new DOMMatrixReadOnly(getComputedStyle(n).transform).m41,
        width: n.clientWidth,
      };
    });
    expect(enter.offset).toBeGreaterThan(0);
    expect(enter.offset).toBeLessThan(enter.width);
    await expect.poll(offset).toBe(0);
    await expect(sidebar).not.toHaveAttribute('inert');
    const exit = await sidebar.evaluate(async (n) => {
      (document.querySelector('[aria-label="收起画布助手"]') as HTMLButtonElement).click();
      const deadline = performance.now() + 1500;
      while (performance.now() < deadline) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const x = new DOMMatrixReadOnly(getComputedStyle(n).transform).m41;
        if (x > 0 && x < n.clientWidth) break;
      }
      return {
        offset: new DOMMatrixReadOnly(getComputedStyle(n).transform).m41,
        width: n.clientWidth,
      };
    });
    expect(exit.offset).toBeGreaterThan(0);
    expect(exit.offset).toBeLessThan(exit.width);
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: '展开画布助手', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(offset).toBe(0);
    await expect(sidebar).toBeVisible();
    await page.getByRole('button', { name: '收起画布助手', exact: true }).click();
    await expect(sidebar).toBeHidden();
    await expect(page.getByTestId('canvas-agent-shell')).toHaveCSS('width', '0px');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await page.evaluate(async () => {
      (document.querySelector('[aria-label="展开画布助手"]') as HTMLButtonElement).click();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return new DOMMatrixReadOnly(
        getComputedStyle(document.querySelector('[data-testid="canvas-agent"]')!).transform,
      ).m41;
    });
    expect(reduced).toBe(0);
    await page.getByRole('button', { name: '收起画布助手', exact: true }).click();
    await expect(sidebar).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('canvas-assistant-closed.png') });
  } finally {
    await app.close();
  }
});

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
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const handle = page.getByRole('separator', { name: '调整侧栏宽度' });
    await expect(handle).toHaveAttribute('aria-valuenow', '248');
    async function dragBy(delta: number) {
      const initial = Number(await handle.getAttribute('aria-valuenow'));
      const target = Math.min(320, Math.max(230, initial + delta));
      const bounds = await handle.boundingBox();
      if (!bounds) throw new Error('Missing resize handle');
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + 160;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + delta, y, { steps: 10 });
      await expect(handle).toHaveAttribute('aria-valuenow', String(target));
      await page.mouse.up();
    }
    await dragBy(200);
    await expect(handle).toHaveAttribute('aria-valuenow', '320');
    await page.screenshot({ path: test.info().outputPath('sidebar-wide.png') });
    await dragBy(-200);
    await expect(handle).toHaveAttribute('aria-valuenow', '230');
    await dragBy(50);
    await expect(handle).toHaveAttribute('aria-valuenow', '280');
    await expect(page.getByTestId('save-status')).toHaveText('已保存到本机');
    await page.reload();
    await page.getByRole('button', { name: 'AIGC 创作空间', exact: true }).click();
    await expect(handle).toHaveAttribute('aria-valuenow', '280');
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(handle).toHaveAttribute('aria-valuenow', '290');
    await handle.dblclick();
    await expect(handle).toHaveAttribute('aria-valuenow', '248');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const intermediate = await page.evaluate(async () => {
      (document.querySelector('[aria-label="收起侧栏"]') as HTMLButtonElement).click();
      const node = document.querySelector('[data-testid="sidebar-shell"]')!;
      const deadline = performance.now() + 1500;
      while (performance.now() < deadline) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const x =
          node.getBoundingClientRect().x -
          node.closest('[data-testid="shell-panel"]')!.getBoundingClientRect().x -
          0.5;
        if (x < 0 && x > -node.clientWidth) break;
      }
      return (
        node.getBoundingClientRect().x -
        node.closest('[data-testid="shell-panel"]')!.getBoundingClientRect().x -
        0.5
      );
    });
    expect(intermediate).toBeLessThan(0);
    expect(intermediate).toBeGreaterThan(-248);
    // Reverse before the exit has completed.
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page
          .getByTestId('sidebar-shell')
          .evaluate((n) =>
            Math.round(
              n.getBoundingClientRect().x -
                n.closest('[data-testid="shell-panel"]')!.getBoundingClientRect().x -
                0.5,
            ),
          ),
      )
      .toBe(0);
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeFocused();
    await expect
      .poll(() =>
        page
          .getByTestId('workspace')
          .evaluate((n) =>
            Math.round(
              n.getBoundingClientRect().x -
                n.closest('[data-testid="shell-panel"]')!.getBoundingClientRect().x -
                0.5,
            ),
          ),
      )
      .toBe(0);
    await expect(page.getByTestId('sidebar-shell')).toHaveAttribute('inert', '');
    await page.screenshot({ path: test.info().outputPath('sidebar-collapsed.png') });
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect(page.getByRole('button', { name: '收起侧栏' })).toBeFocused();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(handle).toHaveAttribute('aria-valuenow', '248');
    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', '320');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect
      .poll(() =>
        page
          .getByTestId('sidebar-shell')
          .evaluate((n) =>
            Math.round(
              n.getBoundingClientRect().x -
                n.closest('[data-testid="shell-panel"]')!.getBoundingClientRect().x -
                0.5,
            ),
          ),
      )
      .toBe(-320);
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect
      .poll(() =>
        page
          .getByTestId('workspace')
          .evaluate((n) =>
            Math.round(
              n.getBoundingClientRect().x -
                n.closest('[data-testid="shell-panel"]')!.getBoundingClientRect().x -
                0.5,
            ),
          ),
      )
      .toBe(320);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

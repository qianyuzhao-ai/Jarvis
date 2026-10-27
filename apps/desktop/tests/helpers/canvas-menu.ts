import { expect, type Page } from '@playwright/test';

async function openCanvasMenu(page: Page) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('canvas-more').click();
  await expect(page.getByRole('menu')).toBeVisible();
}

/** Picks an item (导出 Excel, 画布磁性吸附, 显示背景圆点) from the canvas header's 更多 menu. */
export async function canvasMenu(page: Page, item: string) {
  await openCanvasMenu(page);
  await page.getByRole('menu').getByText(item, { exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Whether a switch in the 更多 menu is on; the menu is closed again afterwards. */
export async function canvasOption(page: Page, name: string) {
  await openCanvasMenu(page);
  const checked = await page.getByRole('menuitemcheckbox', { name }).getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return checked === 'true';
}

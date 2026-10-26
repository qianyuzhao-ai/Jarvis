import { expect, type Page } from '@playwright/test';

/** Opens the composer's model menu (model + thinking level in one trigger). */
async function openModelMenu(page: Page) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('model-trigger').click();
  await expect(page.getByRole('menu').first()).toBeVisible();
}

/** Picks a chat model by name, looking under 更多模型 when it belongs to another provider. */
export async function pickModel(page: Page, name: string) {
  await openModelMenu(page);
  const item = page.getByRole('menuitemradio', { name, exact: true });
  if ((await item.count()) === 0) await page.getByRole('menuitem', { name: '更多模型' }).click();
  await item.click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Picks a thinking level by its label (关闭, 高 …) for the current model. */
export async function pickThinking(page: Page, label: string) {
  await openModelMenu(page);
  await page.getByRole('menuitem', { name: '思考程度' }).click();
  await page.getByRole('menuitemradio', { name: label, exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Counts the thinking levels offered for the current model, then closes the menu. */
export async function thinkingLevelCount(page: Page) {
  await openModelMenu(page);
  await page.getByRole('menuitem', { name: '思考程度' }).click();
  const count = await page.getByRole('menu').last().getByRole('menuitemradio').count();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return count;
}

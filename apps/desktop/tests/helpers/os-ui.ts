import { expect, type Page } from '@playwright/test';

/**
 * Picks an item from the project menu. A menu that is still closing hands focus back to its
 * trigger when its animation ends, which would dismiss a menu opened meanwhile, so this waits.
 */
export async function projectMenu(page: Page, item: string) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('project-switcher').click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Starts a fresh project from the project menu; the tab shows its empty conversation. */
export async function newProject(page: Page) {
  await projectMenu(page, '新建项目');
  await expect(page.getByTestId('project-switcher')).toHaveText('新项目');
  await expect(page.locator('.chat-welcome')).toBeVisible();
}

/** Approves the irreversible step whose card shows all of `texts`, from the Overview. */
export async function approveInOverview(page: Page, texts: string[], screenshot?: string) {
  await page.getByTestId('overview-link').click();
  const card = page.getByTestId('overview').getByTestId('decision-card');
  for (const text of texts) await expect(card).toContainText(text);
  if (screenshot) await page.screenshot({ path: screenshot });
  await card.getByRole('button', { name: '批准执行' }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: '打开协调对话' }).click();
}

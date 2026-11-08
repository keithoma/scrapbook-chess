import { expect, type Page } from '@playwright/test';

export async function prepareReview(page: Page, color?: 'white' | 'black') {
  if (color) await page.getByLabel('I played as').selectOption(color);
  const action = page.getByRole('button', { name: /^(Analyze this game|Resume analysis)$/ });
  if (await action.count()) await action.click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 150000 });
  await expect(page.getByTestId('board')).toBeVisible();
}

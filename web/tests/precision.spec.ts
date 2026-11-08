import { prepareReview } from './helpers';
import { expect, test } from '@playwright/test';

test('native analysis adds precision badges and collected evidence survives eviction and color correction', async ({
  page,
}) => {
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  const summary = page.locator('summary').filter({ hasText: 'Import a PGN or try an example' });
  if (!(await summary.locator('..').evaluate((element) => element.hasAttribute('open'))))
    await summary.click();
  await page.getByLabel('PASTE ONE PGN').fill('1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await page.getByLabel('I played as').selectOption('black');
  await expect(
    page.getByText('Analyze the complete game and collect again for evaluation-based badges.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collect rewards', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByTestId('total-badge_no_blunders')).toHaveText('0 / 1');
  await page.getByRole('link', { name: 'Game review', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', {
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('Adult Supervision');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_no_blunders')).toHaveText('0');
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_no_blunders')).toHaveText('1');
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByTestId('total-badge_no_blunders')).toHaveText('1 / 2');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('scrapbook-browser-proof');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByTestId('total-badge_no_blunders')).toHaveText('1 / 2');
  await page.getByRole('button', { name: 'Replay game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await prepareReview(page);
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await page.getByLabel('I played as').selectOption('white');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByTestId('total-badge_no_blunders')).toHaveText('0 / 1');
});

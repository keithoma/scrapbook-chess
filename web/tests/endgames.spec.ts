import { expect, test } from '@playwright/test';
import { prepareReview } from './helpers';

test('pawn endings preview, collect and replay one stable grade with separate progress and color correction', async ({ page }, info) => {
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  const examples = page.locator('summary').filter({ hasText: 'Import a PGN or try an example' });
  await examples.click();
  await page.getByRole('button', { name: 'Pawn endgame example', exact: true }).click();
  await page.getByLabel('I played as').selectOption('white');
  const review = page.getByTestId('pawn-endgame-review');
  await expect(review).toContainText('Endgame XP pending: analyze the complete game.');
  await prepareReview(page);
  await expect(review).toContainText('Your endgame moves: 3');
  await expect(review).toContainText('Result: Win');
  await expect(review.getByTestId('endgame-grade')).toHaveText(/^Endgame grade: [DCBAS][+-]?$/);
  const grade = await review.getByTestId('endgame-grade').textContent();
  const xp = Number((await review.getByTestId('endgame-award').textContent())!.match(/\+(\d+) XP/)![1]);
  expect(xp).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText(`Pawn vs Pawn +${xp} XP`);
  await expect(page.getByTestId('replay-mastery_pawn_vs_pawn')).toHaveText(`Pawn vs Pawn +${xp} XP`);
  await expect(review.getByTestId('endgame-award')).toHaveText(`Collected +${xp} XP`);
  await review.getByRole('button', { name: 'Replay endgame', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 0 / 5');
  await expect(page.getByTestId('replay-mastery_pawn_vs_pawn')).toHaveText('Pawn vs Pawn +0 XP');
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  const mastery = page.getByTestId('mastery_pawn_vs_pawn');
  await expect(mastery.getByTestId('mastery_pawn_vs_pawn-total-xp')).toHaveText(`${xp} XP`);
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('0 XP');
  await expect(page.getByTestId('skewer-total-xp')).toHaveText('0 XP');
  await mastery.locator('summary').click();
  await expect(mastery.getByTestId('endgame-grade')).toHaveText(grade!);
  await page.screenshot({ path: info.outputPath('pawn-endgame-mastery.png'), fullPage: true });

  // Stored evidence is enough to keep the award and its grade after cache loss.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('scrapbook-browser-proof');
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(mastery.getByTestId('mastery_pawn_vs_pawn-total-xp')).toHaveText(`${xp} XP`);
  await mastery.locator('summary').click();
  await expect(mastery.getByTestId('endgame-grade')).toHaveText(grade!);
  await mastery.getByRole('button', { name: 'Replay endgame', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await expect(review.getByTestId('endgame-grade')).toHaveText(grade!);
  await prepareReview(page);
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await page.getByLabel('I played as').selectOption('black');
  await expect(review).toContainText('Your endgame moves: 2');
  await expect(review).toContainText('Result: Loss');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(mastery.getByTestId('mastery_pawn_vs_pawn-total-xp')).not.toHaveText(`${xp} XP`);
  await mastery.locator('summary').click();
  await expect(mastery).toContainText('Result: Loss');
  await expect(mastery.locator('summary')).toHaveCount(1);
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(mastery.getByRole('heading')).toHaveText('Bauern gegen Bauern');
  await expect(mastery.getByTestId('endgame-grade')).toContainText('Endspielnote:');
});

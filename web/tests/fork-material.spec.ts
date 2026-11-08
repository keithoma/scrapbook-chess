import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { prepareReview } from './helpers';

for (const [fixture, xp] of [
  ['halce-noctu2nality-ne2', 137],
  ['halce-noctu2nality-nxd4', 0],
] as const) {
  test(`${fixture} awards ${xp} fork XP after native analysis and collection`, async ({
    page,
  }) => {
    const pgn = readFileSync(
      new URL(`../src/fixtures/games/${fixture}.pgn`, import.meta.url),
      'utf8',
    );
    await page.goto('/review');
    await expect(page.getByTestId('status')).toHaveAttribute(
      'data-state',
      'ready',
    );
    const summary = page
      .locator('summary')
      .filter({ hasText: 'Import a PGN or try an example' });
    if (
      !(await summary
        .locator('..')
        .evaluate((element) => element.hasAttribute('open')))
    )
      await summary.click();
    await page.getByLabel('PASTE ONE PGN').fill(pgn);
    await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
    await expect(page.getByTestId('status')).toHaveAttribute(
      'data-state',
      'ready',
    );
    await prepareReview(page, 'black');

    const inspector = page.getByTestId('fork-inspector');
    if (xp) {
      await inspector.getByRole('button', { name: /Ne2\+/ }).click();
      await expect(page.getByTestId('fork-award')).toContainText(
        'Qualified fork · +137 XP',
      );
      await expect(page.getByTestId('fork-grade')).toHaveText('Fork grade: S+');
    }
    await inspector.getByRole('button', { name: /Nxd4/ }).click();
    await expect(page.getByTestId('fork-award')).toContainText(
      'No mastery XP: no profitable fork survives the immediate defenses.',
    );
    await page
      .getByRole('button', { name: 'Collect rewards', exact: true })
      .click();
    await expect(page.getByTestId('reward-reveal')).toBeVisible();
    await expect(page.getByTestId('replay-mastery-xp')).toHaveText(
      `Knight forks +${xp} XP`,
    );
    await page
      .getByRole('button', { name: 'Collect rewards', exact: true })
      .click();
    await expect(page.getByTestId('reward-reveal')).toContainText(
      'No progress was counted twice.',
    );
    await page.getByRole('link', { name: 'Achievements', exact: true }).click();
    await expect(page.getByTestId('mastery-total-xp')).toHaveText(`${xp} XP`);
    await page.reload();
    await expect(page.getByTestId('mastery-total-xp')).toHaveText(`${xp} XP`);
  });
}

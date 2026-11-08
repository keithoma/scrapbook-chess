import { prepareReview } from './helpers';
import { expect, test, type Page } from '@playwright/test';

async function load(page: Page, pgn: string) {
  const summary = page.locator('summary').filter({ hasText: 'Import a PGN or try an example' });
  if (!(await summary.locator('..').evaluate(element => element.hasAttribute('open')))) await summary.click();
  await page.getByLabel('PASTE ONE PGN').fill(pgn);
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await expect(page.getByTestId('status')).not.toHaveAttribute('data-state', 'loading');
  await prepareReview(page, 'white');
}

test('the supplied Black game exposes Nxe3, its recapture risk, and native engine evidence without awarding XP', async ({ page }, info) => {
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await prepareReview(page);
  const inspector = page.getByTestId('fork-inspector');
  await inspector.getByRole('button', { name: '15… Nxe3', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 30 / 52');
  await expect(page.getByTestId('highlight-reasons')).toContainText('Knight-fork candidate: the knight on e3 attacks enemy pieces on f1, c2, g2.');
  await expect(inspector.getByLabel('Attacked pieces')).toContainText('Queen on c2');
  await expect(inspector.getByLabel('Attacked pieces')).toContainText('Rook on f1');
  await expect(inspector).toContainText('Your opponent can legally capture the knight immediately.');
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await expect(page.locator('[data-fork-source]')).toHaveCount(1);
  await expect(page.locator('[data-fork-target]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('[data-fork-target]')).toHaveCount(3);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await expect(page.getByTestId('fork-engine')).toContainText('Evaluation loss:');
  await expect(page.getByTestId('fork-engine')).toContainText('moving player’s perspective');
  await page.screenshot({ path: info.outputPath('fork-inspection.png'), fullPage: true });

  await page.getByLabel('Virtual continuation', { exact: true }).getByRole('button').last().click();
  await expect(page.getByTestId('highlight-reasons')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Autoplay', exact: true })).toBeDisabled();
  await expect(page.getByTestId('fork-evidence')).toHaveCount(0);
  await expect(page.locator('[data-fork-target]')).toHaveCount(0);
  await inspector.getByRole('button', { name: '15… Nxe3', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 30 / 52');
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await page.reload();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  await inspector.getByRole('button', { name: '15… Nxe3', exact: true }).click();
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await page.getByLabel('I played as').selectOption('white');
  await expect(inspector.getByRole('button', { name: '15… Nxe3', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-fork-target]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByText('No games collected yet.', { exact: true })).toBeVisible();
});

test('pinned and low-value counterexamples stay reviewable in both languages', async ({ page }) => {
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, '[SetUp "1"]\n[FEN "k3r3/8/8/8/3N4/2r3r1/8/4K3 w - - 0 1"]\n\n1. Ne2 *');
  const inspector = page.getByTestId('fork-inspector');
  await inspector.getByRole('button', { name: '1. Ne2', exact: true }).click();
  await expect(inspector).toContainText('Pinned knight:');
  await expect(inspector.getByLabel('Attacked pieces')).toHaveText('Rook on c3Rook on g3');
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(inspector.getByRole('heading')).toHaveText('Mögliche Springergabeln');
  await expect(inspector).toContainText('Gefesselter Springer:');
  await expect(inspector.getByLabel('Angegriffene Figuren')).toContainText('Turm auf c3');
  await page.getByLabel('Sprache', { exact: true }).selectOption('en');

  await load(page, '[SetUp "1"]\n[FEN "7k/3b4/8/8/2p5/3N4/8/7K w - - 0 1"]\n\n1. Ne5 *');
  await inspector.getByRole('button', { name: '1. Ne5', exact: true }).click();
  await expect(inspector).toContainText('Only pawns or minor pieces are attacked.');
  await expect(page.getByTestId('fork-award')).toContainText('No mastery XP:');
  await page.getByLabel('I played as').selectOption('');
  await expect(page.getByTestId('review-gate')).toContainText('Choose your side below');
  await expect(page.getByTestId('fork-evidence')).toHaveCount(0);
  await expect(page.locator('[data-fork-target]')).toHaveCount(0);
  await page.getByLabel('I played as').selectOption('black');
  await expect(inspector).toContainText('No knight-fork candidates in your played moves.');
});

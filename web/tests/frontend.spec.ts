import { test, expect } from '@playwright/test';
import { prepareReview } from './helpers';

const mate = '[White "Alice"]\n[Black "You"]\n[Date "2026.11.01"]\n[TimeControl "180+2"]\n\n1. f3 e5 2. g4 Qh4# 0-1';

test('main destinations, empty states, collection filters and narrow layouts work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for new games', exact: true })).toBeDisabled();
  await expect(page.getByText('Your next game starts here.')).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Home', 'Achievements', 'History']) {
      await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await expect(page.getByText('No games yet. Import a game from Home to get started.')).toBeVisible();
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await page.getByLabel('Unlock status', { exact: true }).selectOption('unlocked');
  await expect(page.getByText('No badges match these filters.')).toBeVisible();
  await page.getByLabel('Unlock status', { exact: true }).selectOption('all');
  await page.getByLabel('Search badges', { exact: true }).fill('Obsession');
  await expect(page.locator('.badge-card')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Obsession', exact: true })).toContainText('Veterancy · Mileage');
  await expect(page.locator('.tier-legend li')).toHaveText(['Stone', 'Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King', 'Immortal', 'Legend']);
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByRole('heading', { name: 'Erfolge', exact: true })).toBeVisible();
  await page.goto('/not-a-page');
  await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible();
});

test('PGN preparation gates review, playback and highlights work, and collection survives a deep-link reload', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByText('Import a PGN or try an example', { exact: true }).click();
  await page.getByLabel('PASTE ONE PGN').fill(mate);
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await expect(page).toHaveURL(/\/review\?game=/);
  await expect(page.getByTestId('review-gate')).toBeVisible();
  await expect(page.getByTestId('board')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Collect rewards', exact: true })).toBeDisabled();
  await prepareReview(page, 'black');
  const board = page.getByTestId('board');
  await expect(board.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await expect.poll(() => board.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(board.locator('.square').first()).toHaveAttribute('data-square', 'a8');
  await page.getByLabel('Autoplay speed', { exact: true }).selectOption('2000');
  await page.getByRole('button', { name: 'Autoplay', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 1 / 4');
  await page.getByRole('button', { name: 'Pause autoplay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Autoplay', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(page.getByTestId('highlight-reasons')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next highlight', exact: true }).click();
  await expect(page.getByTestId('replay-position')).not.toHaveText('Ply 0 / 4');
  for (let index = 0; index < 4 && await page.getByRole('button', { name: 'Next highlight', exact: true }).isEnabled(); index++) await page.getByRole('button', { name: 'Next highlight', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 4 / 4');
  await expect(page.getByTestId('highlight-reasons')).toContainText('Checkmate earned the Qh4# scrap.');
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByTestId('highlight-reasons')).toContainText('Das Schachmatt hat den Schnipsel Qh4# eingebracht.');
  await page.getByLabel('Sprache', { exact: true }).selectOption('en');
  await expect(board.locator('.in-check')).toHaveAttribute('data-square', 'e1');
  await expect(board.locator('.last-move')).toHaveCount(2);
  await page.getByRole('button', { name: 'Skip to rewards', exact: true }).click();
  await expect(page.locator('#review-rewards')).toBeFocused();
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  const selectedUrl = page.url();
  await page.reload();
  await expect(board).toBeVisible();
  await expect(page).toHaveURL(selectedUrl);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await board.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('review.png'), fullPage: true });
  await page.getByRole('link', { name: 'History', exact: true }).click();
  const row = page.locator('.game-row');
  await expect(row).toContainText('Alice');
  await expect(row).toContainText('180+2');
  await expect(row).toContainText('Win');
  await expect(row).toContainText('Rewards collected');
  await page.getByLabel('Search players').fill('missing opponent');
  await expect(page.getByText('No games match these filters.')).toBeVisible();
  await page.getByLabel('Search players').fill('Alice');
  await row.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(board).toBeVisible();
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  expect(errors).toEqual([]);
});

test('Home checks linked accounts, reports discovered games and supports next-game preparation', async ({ page }, info) => {
  await page.request.post('/api/__test/reset');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Use local mock login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Linked accounts', exact: true })).toBeVisible();
  await page.getByLabel('Platform', { exact: true }).selectOption('chesscom');
  await page.getByLabel('Platform username', { exact: true }).fill('testchess');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await expect(page.getByText('chess.com · testchess', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Check for new games', exact: true }).click();
  const fresh = page.getByRole('heading', { name: 'Newly discovered', exact: true }).locator('..');
  await expect(fresh.locator('.game-row')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await fresh.locator('.game-row').first().getByRole('button', { name: 'Select game', exact: true }).click();
  await expect(page.getByLabel('I played as')).toBeDisabled();
  await expect(page.getByLabel('I played as')).toHaveValue('black');
  await prepareReview(page);
  const selected = page.url();
  await page.getByRole('button', { name: 'Next game', exact: true }).click();
  await expect(page).not.toHaveURL(selected);
  await expect(page.getByTestId('review-gate')).toBeVisible();
  await expect(page.getByTestId('board')).toHaveCount(0);
});

test('collected-game reward previews retain their original time zone after settings change', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Time zone', { exact: true }).fill('UTC');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByText('Import a PGN or try an example', { exact: true }).click();
  await page.getByLabel('PASTE ONE PGN').fill('[UTCDate "2026.11.08"]\n[UTCTime "00:30:00"]\n[TimeControl "180+2"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await prepareReview(page, 'black');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_played_sunday')).toHaveText('1');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Time zone', { exact: true }).fill('America/Los_Angeles');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await page.getByRole('link', { name: 'Game review', exact: true }).click();
  await expect(page.getByTestId('replay-badge_played_sunday')).toHaveText('1');
});

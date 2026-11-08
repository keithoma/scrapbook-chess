import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Use local mock login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Linked accounts', exact: true })).toBeVisible();
}

test('mock profile backdates once, imports both platforms, and restores saved rewards and analysis in another browser', async ({ page, browser }, info) => {
  await page.request.post('/api/__test/reset');
  await login(page);
  const initial = await (await page.request.get('/api/me')).json();
  expect(initial.accounts[0].username).toBe('noctu2nality');
  expect(Math.abs(Date.now() - initial.user.createdAt - 8 * 3600_000)).toBeLessThan(10_000);
  await page.getByLabel('Platform', { exact: true }).selectOption('chesscom');
  await page.getByLabel('Platform username', { exact: true }).fill('testchess');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await expect(page.getByText('chess.com · testchess', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check for new games', exact: true }).click();
  const game = page.getByTestId('imported-lichess:Mock0001');
  await expect(game).toContainText('noctu2nality');
  await expect(page.getByTestId('imported-chesscom:live:999001')).toContainText('testchess');
  await page.screenshot({ path: info.outputPath('profile-imports.png'), fullPage: true });
  await game.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByLabel('I played as')).toHaveValue('black');
  await expect(page.getByLabel('I played as')).toBeDisabled();
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await expect(page.getByTestId('total-badge_moves_played')).toHaveText('2 / 100');
  await expect(page.getByTestId('scrap-Qh4#')).toContainText('Real');
  await expect(page.locator('[aria-labelledby="collection-title"]').getByText('Lichess · noctu2nality', { exact: true })).toBeVisible();

  const secondContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const second = await secondContext.newPage();
  await login(second);
  const restored = await (await second.request.get('/api/me')).json();
  expect(restored.user.createdAt).toBe(initial.user.createdAt);
  await second.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(second.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await second.getByRole('link', { name: 'Profile', exact: true }).click();
  await second.getByTestId('imported-lichess:Mock0001').getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(second.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  await expect(second.getByTestId('progress')).toHaveText('4 / 4');
  await second.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(second.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await secondContext.close();
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use local mock login', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByText('No games collected yet.', { exact: true })).toBeVisible();
});

test('German profile controls, source-specific history, and one-account limit work in mock mode', async ({ page }) => {
  await page.request.post('/api/__test/reset');
  await login(page);
  await page.getByLabel('Platform', { exact: true }).selectOption('lichess');
  await page.getByLabel('Platform username', { exact: true }).fill('anotheraccount');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Only one account per platform is allowed.');
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByRole('heading', { name: 'Dein Profil und deine Partien', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nach neuen Partien suchen', exact: true }).click();
  await expect(page.getByTestId('imported-lichess:Mock0001')).toContainText('Schwarz');
});

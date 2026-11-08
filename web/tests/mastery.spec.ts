import { expect, test, type Page } from '@playwright/test';

async function example(page: Page, another = false) {
  const summary = page.locator('summary').filter({ hasText: 'Open another page of the notebook' });
  if (!(await summary.locator('..').evaluate(element => element.hasAttribute('open')))) await summary.click();
  if (!another) await page.getByRole('button', { name: 'Fork example', exact: true }).click();
  else {
    const pgn = '[White "Another White"]\n[Black "Another Black"]\n[Result "1/2-1/2"]\n[SetUp "1"]\n[FEN "3q3k/8/8/4N3/8/8/8/7K w - - 0 1"]\n\n1. Nf7+ 1/2-1/2';
    await page.getByLabel('PASTE ONE PGN').fill(pgn);
    await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  }
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await page.getByLabel('I played as').selectOption('white');
  await page.getByTestId('fork-inspector').getByRole('button', { name: '1. Nf7+', exact: true }).click();
}
async function analyze(page: Page) {
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
}
async function collect(page: Page) {
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
}
async function collection(page: Page, xp: number, level: number) {
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByTestId('mastery-total-xp')).toHaveText(`${xp} XP`);
  await expect(page.getByTestId('fork-mastery')).toContainText(`Level ${level}`);
}

test('native fork analysis earns XP, levels up, replays progress, and supports color correction', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await example(page);
  await expect(page.getByTestId('fork-award')).toContainText('Mastery XP pending');
  await collect(page);
  await collection(page, 0, 1);
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await analyze(page);
  await expect(page.getByTestId('fork-award')).toContainText('Qualified fork · +137 XP');
  await collect(page);
  await expect(page.getByTestId('reward-reveal')).toContainText('Knight forks +137 XP');
  await expect(page.getByTestId('replay-mastery-xp')).toHaveText('Knight forks +137 XP');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(page.getByTestId('replay-mastery-xp')).toHaveText('Knight forks +0 XP');
  await collect(page);
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collection(page, 137, 1);
  await page.getByTestId('fork-mastery').locator('summary').click();
  await page.getByRole('button', { name: 'Replay fork', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 1 / 1');
  await expect(page.getByTestId('fork-award')).toContainText('Collected +137 XP');

  await example(page, true);
  await analyze(page);
  await collect(page);
  await expect(page.getByTestId('reward-reveal')).toContainText('Knight forks reached level 2!');
  await collection(page, 274, 2);
  await page.screenshot({ path: info.outputPath('mastery-level.png'), fullPage: true });
  await page.reload();
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('274 XP');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await page.getByLabel('I played as').selectOption('black');
  await collect(page);
  await collection(page, 137, 1);
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByRole('heading', { name: 'Meisterschaften', exact: true })).toBeVisible();
  await expect(page.getByTestId('fork-mastery')).toContainText('Stufe 1');
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('137 EP');
});

test('two tabs save one XP award and collected evidence survives checkpoint eviction', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await example(page);
  await analyze(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  await second.getByLabel('I played as').selectOption('white');
  await Promise.all([page, second].map(tab => collect(tab)));
  await collection(page, 137, 1);
  await second.close();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('scrapbook-browser-proof');
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('137 XP');
  await page.getByTestId('fork-mastery').locator('summary').click();
  await page.getByRole('button', { name: 'Replay fork', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('fork-award')).toContainText('Collected +137 XP');
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await collect(page);
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collection(page, 137, 1);
});

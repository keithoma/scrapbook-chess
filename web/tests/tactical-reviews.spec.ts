import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import config from '../vite.config';
import { tacticalReviewFixtures } from '../dev/tactical-review-fixtures';
import { TACTICAL_REVIEW_URL, type TacticalReviewFixture } from '../src/tactics/review-fixture';
import { prepareReview } from './helpers';

let directory: string;
let server: ViteDevServer;
let devOrigin: string;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scrapbook-review-browser-'));
  server = await createServer({
    ...config, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': 'http://127.0.0.1:8788' } },
    plugins: config.plugins!.map(plugin => (plugin as { name?: string })?.name === 'tactical-review-fixtures'
      ? tacticalReviewFixtures({ directory }) : plugin),
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP dev server.');
  devOrigin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await server?.close();
  await rm(directory, { recursive: true, force: true });
});

async function example(page: Page, name: 'Fork example' | 'Skewer example') {
  const summary = page.locator('summary').filter({ hasText: 'Import a PGN or try an example' });
  if (!(await summary.locator('..').evaluate(element => element.hasAttribute('open')))) await summary.click();
  await page.getByRole('button', { name, exact: true }).click();
  await prepareReview(page, 'white');
}
async function fixtures() {
  const files = (await readdir(directory)).filter(name => name.endsWith('.json'));
  return Promise.all(files.map(async name => JSON.parse(await readFile(join(directory, name), 'utf8')) as TacticalReviewFixture));
}

test('development judgments survive navigation and reload, replace fixtures, and support both tactics', async ({ page }, info) => {
  await page.goto(`${devOrigin}/review`);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await example(page, 'Fork example');
  const inspector = page.getByTestId('fork-inspector');
  await inspector.getByRole('button', { name: '1. Nf7+', exact: true }).click();
  const review = inspector.getByTestId('tactical-review');
  await expect(review).toContainText('No judgment saved yet.');
  await review.getByRole('button', { name: 'Should earn XP', exact: true }).click();
  await expect(review).toContainText('Saved: should earn XP.');
  await expect.poll(async () => (await fixtures()).length).toBe(1);
  expect((await fixtures())[0]).toMatchObject({
    expectedXp: 'positive', masteryId: 'mastery_knight_forks', ply: 1,
    observed: { status: 'qualified' },
    analysis: { result: { ply: 1, bestMove: expect.any(String), best: { type: expect.any(String) } } },
  });
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(page.getByTestId('tactical-review')).toHaveCount(0);
  await inspector.getByRole('button', { name: '1. Nf7+', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Should earn XP', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await review.getByRole('button', { name: 'Should earn 0 XP', exact: true }).click();
  await expect(review).toContainText('Saved: should earn 0 XP.');
  expect(await fixtures()).toHaveLength(1);
  expect((await fixtures())[0].expectedXp).toBe('zero');
  await page.reload();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  await prepareReview(page, 'white');
  await inspector.getByRole('button', { name: '1. Nf7+', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Should earn 0 XP', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(review.getByRole('button', { name: 'Sollte 0 EP bringen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Sprache', { exact: true }).selectOption('en');

  // A failed write must retain the last saved judgment and offer a retry.
  await page.route(`**${TACTICAL_REVIEW_URL}`, route => route.fulfill({ status: 500, body: '{}' }));
  await review.getByRole('button', { name: 'Should earn XP', exact: true }).click();
  await expect(review).toContainText('Could not save the review fixture. Try again.');
  await expect(review.getByRole('button', { name: 'Should earn 0 XP', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.unroute(`**${TACTICAL_REVIEW_URL}`);
  await review.getByRole('button', { name: 'Should earn XP', exact: true }).click();
  await expect(review).toContainText('Saved: should earn XP.');
  await page.screenshot({ path: info.outputPath('tactical-review.png'), fullPage: true });

  await example(page, 'Skewer example');
  const skewer = page.getByTestId('skewer-inspector');
  await skewer.getByRole('button', { name: /Bb2/ }).click();
  await expect(skewer.getByTestId('tactical-review')).toContainText('No judgment saved yet.');
  await skewer.getByRole('button', { name: 'Should earn 0 XP', exact: true }).click();
  await expect(skewer.getByTestId('tactical-review')).toContainText('Saved: should earn 0 XP.');
  const saved = await fixtures();
  expect(saved).toHaveLength(2);
  expect(saved.find(fixture => fixture.masteryId === 'mastery_knight_forks')?.expectedXp).toBe('positive');
  expect(saved.find(fixture => fixture.masteryId === 'mastery_skewers')?.expectedXp).toBe('zero');
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByText('No games collected yet.', { exact: true })).toBeVisible();
});

test('production preview exposes neither review controls nor the fixture-writing endpoint', async ({ page }) => {
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await example(page, 'Fork example');
  await page.getByTestId('fork-inspector').getByRole('button', { name: '1. Nf7+', exact: true }).click();
  await expect(page.getByTestId('tactical-review')).toHaveCount(0);
  const response = await page.request.put(TACTICAL_REVIEW_URL, { data: {} });
  expect(response.status()).toBe(404);
});

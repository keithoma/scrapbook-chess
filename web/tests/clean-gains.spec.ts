import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import config from '../vite.config';
import { cleanGainReviews } from '../dev/clean-gain-reviews';
import type { CleanGainReview } from '../src/chess/clean-gain-review';
import { CLEAN_GAIN_EXAMPLES } from '../src/fixtures/clean-gain-examples';
import { prepareReview } from './helpers';

let directory: string;
let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scrapbook-material-'));
  server = await createServer({ ...config, configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 },
    plugins: config.plugins!.map(plugin => (plugin as { name?: string })?.name === 'clean-gain-reviews' ? cleanGainReviews({ directory }) : plugin),
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server.');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); await rm(directory, { recursive: true, force: true }); });

test('real Stockfish evidence, independent judgments, and replay survive navigation and reload', async ({ page }, info) => {
  test.setTimeout(300000);
  await page.goto(`${origin}/material-review`);
  await expect(page.getByTestId('clean-gain-lab')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Run detector', exact: true }).click();
  await expect(page.getByTestId('material-status')).toHaveAttribute('data-busy', 'false', { timeout: 180000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Material review note').fill('Independent review of the engine continuation.');
  await page.getByRole('button', { name: 'Should count', exact: true }).click();
  await expect(page.getByTestId('material-status')).toContainText('Saved: should count');
  const filenames = (await readdir(directory)).filter(name => name.endsWith('.json'));
  expect(filenames).toHaveLength(1);
  const fixture = JSON.parse(await readFile(join(directory, filenames[0]), 'utf8')) as CleanGainReview;
  await info.attach('real-engine-evidence', { body: JSON.stringify(fixture, null, 2), contentType: 'application/json' });
  await writeFile(info.outputPath('engine-evidence.json'), JSON.stringify(fixture, null, 2));
  await expect(page.getByTestId('material-verdict')).toHaveAttribute('data-status', 'qualified');
  await page.getByRole('button', { name: 'Engine continuation', exact: true }).click();
  const start = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByRole('button', { name: 'Material next move', exact: true }).click();
  expect(await page.getByTestId('board').getAttribute('data-fen')).not.toBe(start);
  await page.getByLabel('Material search depth').selectOption('0');
  await page.getByLabel('Material engine line').selectOption('before');
  await expect(page.getByTestId('material-line-moves').getByRole('button')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Actual game', exact: true }).click();
  await page.getByRole('button', { name: 'Material first position', exact: true }).click();
  await expect(page.getByTestId('material-board-position')).toContainText('0 /');
  await page.route('**/__dev/clean-gain-reviews', route => route.fulfill({ status: 500, body: '{}' }));
  await page.getByRole('button', { name: 'Should not count', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByRole('button', { name: 'Should count', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.unroute('**/__dev/clean-gain-reviews');
  await page.getByRole('button', { name: 'Should not count', exact: true }).click();
  await expect(page.getByTestId('material-status')).toContainText('Saved: should not count');
  expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Should not count', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Material review note')).toHaveValue('Independent review of the engine continuation.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('clean-material-review.png'), fullPage: true });

  const current = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByText('Test your own PGN', { exact: true }).click();
  await page.getByLabel('Material test PGN').fill('1. e4 e5 2. Bh6 *');
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Illegal move');
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', current!);
  await page.getByLabel('Material test PGN').fill(fixture.pgn);
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Only the recorded future changes. The same capture must retain its verdict.
  await page.getByLabel('Material example').selectOption('Pawn won, then a later blunder');
  await page.getByRole('button', { name: 'Run detector', exact: true }).click();
  await expect(page.getByTestId('material-status')).toHaveAttribute('data-busy', 'false', { timeout: 180000 });
  await expect(page.getByTestId('material-verdict')).toHaveAttribute('data-status', 'qualified');

  await page.getByLabel('Material example').selectOption('King’s Gambit');
  await page.getByRole('button', { name: 'Run detector', exact: true }).click();
  await expect(page.getByTestId('material-status')).toHaveAttribute('data-busy', 'false', { timeout: 180000 });
  await expect(page.getByTestId('material-verdict')).toContainText('Book line excluded');
  await page.getByLabel('Material example').selectOption('Equal pawn exchange');
  await page.getByLabel('Material capture').selectOption('4');
  await page.getByRole('button', { name: 'Run detector', exact: true }).click();
  await expect(page.getByTestId('material-status')).toHaveAttribute('data-busy', 'false', { timeout: 180000 });
  await expect(page.getByTestId('material-verdict')).not.toHaveAttribute('data-status', 'qualified');
});

test('whole-game processing awards the clean pawn through the actual capture and persists it after reload', async ({ page }) => {
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  const summary = page.locator('summary').filter({ hasText: 'Import a PGN or try an example' });
  if (!(await summary.locator('..').evaluate(element => element.hasAttribute('open')))) await summary.click();
  await page.getByLabel('PASTE ONE PGN').fill(CLEAN_GAIN_EXAMPLES[0].pgn.replace('*', '1-0'));
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await prepareReview(page, 'white');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_clean_pawns')).toHaveText('1');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_clean_pawns')).toHaveText('0');
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(page.getByTestId('total-badge_clean_pawns')).toHaveText('1 / 2');
  await page.reload();
  await expect(page.getByTestId('total-badge_clean_pawns')).toHaveText('1 / 2');
});

test('real-engine analysis refuses a poisoned pawn and a delayed recovery even with the book gate isolated', async ({ page }, info) => {
  await page.goto(`${origin}/material-review`);
  const results = await page.evaluate(async () => {
    const gameModule = '/src/game.ts';
    const engineModule = '/src/stockfish.ts';
    const analyzerModule = '/src/clean-gain-analysis.ts';
    const ruleModule = '/src/chess/clean-gain.ts';
    const { parseGame } = await import(gameModule);
    const { StockfishClient } = await import(engineModule);
    const { analyzeCleanGain } = await import(analyzerModule);
    const { assessCleanGain } = await import(ruleModule);
    const engine = new StockfishClient();
    await engine.init();
    try {
      const cases = [
        '[SetUp "1"]\n[FEN "3r2k1/pp3ppp/3p4/8/4P3/8/PP3PPP/3Q2K1 b - - 0 1"]\n\n1... d5 2. Qxd5 *',
        '1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 *',
      ];
      const results = [];
      for (const [index, pgn] of cases.entries()) {
        const game = parseGame(pgn);
        const ply = index === 0 ? 2 : 5;
        const evidence = await analyzeCleanGain(game, ply, engine, new AbortController().signal, { lookup: () => undefined });
        results.push({ pgn, evidence, assessment: assessCleanGain(game, evidence, () => undefined) });
      }
      return results;
    } finally { engine.terminate(); }
  });
  for (const result of results) expect(result.assessment.status).not.toBe('qualified');
  await info.attach('poison-and-delayed-return', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});

test('the production build cannot write material-review fixtures', async ({ page }) => {
  const response = await page.request.put('/__dev/clean-gain-reviews', { data: {} });
  expect(response.status()).toBe(404);
});

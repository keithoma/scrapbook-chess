import { test, expect, type Page } from '@playwright/test';
import { MATE_PGN } from '../src/game';

const state = (page: Page) => page.getByTestId('status');
async function openInput(page: Page) {
  const details = page.locator('summary').filter({ hasText: 'Import a PGN or try an example' }).locator('..');
  if (!(await details.evaluate(element => element.hasAttribute('open')))) await details.locator('summary').click();
}

test('real Stockfish survives pause/reload, finishes original game, and keeps simulation separate', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const cpuSlowdown = info.project.name === 'mobile-chrome' ? 4 : 1;
  if (cpuSlowdown > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  }
  await page.goto('/review');
  await expect(state(page)).toHaveAttribute('data-state', 'ready');
  await openInput(page);
  await page.getByRole('button', { name: 'Original rapid game', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('I played as').selectOption('white');
  await expect(page.getByTestId('review-gate')).toBeVisible();
  await expect(page.getByTestId('board')).toHaveCount(0);
  const start = Date.now();
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  // This includes downloading the full engine on a cold, throttled browser.
  await expect.poll(async () => Number((await page.getByTestId('progress').innerText()).split('/')[0]), { timeout: 120000 }).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Pause analysis', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'paused');
  const saved = Number((await page.getByTestId('progress').innerText()).split('/')[0]);
  expect(saved).toBeLessThan(137);
  await page.reload();
  await expect(state(page)).toHaveAttribute('data-state', 'paused');
  const restored = Number((await page.getByTestId('progress').innerText()).split('/')[0]);
  expect(restored).toBeGreaterThanOrEqual(saved);
  await page.getByLabel('I played as').selectOption('white');
  await page.getByRole('button', { name: 'Resume analysis', exact: true }).click();
  // Navigation stays responsive while the worker computes; replay stays locked.
  await expect(state(page)).toHaveAttribute('data-state', 'analyzing');
  await expect(page.getByTestId('board')).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByText('Analysis continues in this browser.')).toBeVisible();
  await page.getByRole('link', { name: 'Game review', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  await expect(page.getByTestId('progress')).toHaveText('137 / 137');
  await expect(page.getByTestId('played-moves').getByRole('button')).toHaveCount(137);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 1 / 137');
  const firstFen = await page.getByTestId('board').getAttribute('data-fen');
  await page.getByRole('button', { name: 'Last position' }).click();
  const finalFen = await page.getByTestId('board').getAttribute('data-fen');
  expect(finalFen).not.toBe(firstFen);
  await page.getByRole('button', { name: 'First position' }).click();
  await page.getByRole('button', { name: 'Last position' }).click();
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', finalFen!);
  const simulationMoves = await page.getByLabel('Virtual continuation', { exact: true }).getByRole('button').count();
  expect(simulationMoves).toBeLessThanOrEqual(20);
  const diagnostics = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('scrapbook-browser-proof', 1); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise<any[]>(resolve => { const r = db.transaction('checkpoints').objectStore('checkpoints').getAll(); r.onsuccess = () => resolve(r.result); });
    db.close();
    const checkpoint = rows.find(r => r.results.length === 137);
    return { results: checkpoint.results.length, unique: new Set(checkpoint.results.map((r: any) => r.ply)).size,
      analysisMs: checkpoint.results.reduce((sum: number, r: any) => sum + r.ms, 0),
      simulationPlies: checkpoint.virtual.length, simulationStatus: checkpoint.virtualStatus,
      cached: !!await (await caches.open('scrapbook-stockfish-19.0.1-full-v1')).match('/engine/stockfish-19-single.wasm'),
    };
  });
  expect(diagnostics.unique).toBe(137);
  expect(diagnostics.cached).toBe(true);
  expect(errors).toEqual([]);
  await info.attach('engine-measurements', { body: JSON.stringify({ ...diagnostics, cpuSlowdown, wallMsIncludingReload: Date.now() - start }, null, 2), contentType: 'application/json' });
  console.log(info.project.name, JSON.stringify({ ...diagnostics, cpuSlowdown }));
  await page.screenshot({ path: info.outputPath('browser-proof.png'), fullPage: true });
  await context.setOffline(true);
  await openInput(page);
  await page.getByRole('button', { name: 'Mate example', exact: true }).click();
  await page.getByLabel('I played as').selectOption('black');
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'complete');
  await expect(page.getByTestId('virtual-status')).toContainText('Black mates with Qh4# after 1 simulated plies');
  expect(errors).toEqual([]);
});

test('real mate is terminal; invalid PGN leaves the existing game intact', async ({ page }) => {
  await page.goto('/review');
  await expect(state(page)).toHaveAttribute('data-state', 'ready');
  await openInput(page);
  await page.getByLabel('PASTE ONE PGN').fill(MATE_PGN.replace('2. g4 *', '2. g4 Qh4# 0-1'));
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await page.getByLabel('I played as').selectOption('black');
  await expect(page.getByTestId('board')).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  await expect(page.getByTestId('virtual-status')).toContainText('terminal');
  await page.getByLabel('PASTE ONE PGN').fill('1. e4 e5 2. Bh6 *');
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Illegal move');
  await expect(page.getByTestId('played-moves').getByRole('button')).toHaveCount(4);
});

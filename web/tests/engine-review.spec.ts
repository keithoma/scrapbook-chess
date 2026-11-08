import { expect, test, type Page } from '@playwright/test';
import { parseGame } from '../src/game';
import type { Checkpoint } from '../src/storage';
import type { EnginePick, Score } from '../src/stockfish';

const game = parseGame('[White "Alice"]\n[Black "Bob"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
const cp = (value: number): Score => ({ type: 'cp', value });
const pick = (uci: string, score: Score): EnginePick => ({ uci, score, depth: 6 });
const choices = [
  [pick('f2f3', cp(0)), pick('e2e4', cp(-55)), pick('d2d4', cp(-70))],
  [pick('e7e5', cp(0)), pick('c7c5', cp(55)), pick('e7e6', cp(70))],
  [pick('e2e4', cp(100)), pick('g2g4', cp(90)), pick('d2d4', cp(80))],
  [pick('d8h4', { type: 'mate', value: -1 }), pick('g8f6', cp(0)), pick('b8c6', cp(10))],
];

async function seed(page: Page, legacy = false) {
  const checkpoint: Checkpoint = {
    key: '', version: 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1', pgn: game.pgn,
    results: game.moves.map((move, i) => ({ ply: move.ply, bestMove: choices[i][0].uci,
      best: choices[i][0].score, played: choices[i].find(pick => pick.uci === move.uci)!.score,
      topMoves: legacy ? undefined : choices[i], ms: 1 })),
    virtual: [], virtualStatus: 'terminal', updatedAt: new Date(Date.now() + 1000).toISOString(),
  };
  await page.goto('/review');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await page.evaluate(async checkpoint => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${checkpoint.version}\n${checkpoint.pgn.trim()}`));
    checkpoint.key = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('scrapbook-browser-proof', 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('checkpoints', 'readwrite');
      tx.objectStore('checkpoints').put(checkpoint);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, checkpoint);
  await page.reload();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  await page.getByLabel('I played as').selectOption('white');
  await expect(page.getByTestId('board')).toBeVisible();
}

test('review shows both players’ best and only moves, top three choices, and played evaluations', async ({ page }) => {
  await seed(page);
  const moves = page.getByTestId('played-moves').getByRole('button');
  for (const i of [0, 1]) {
    await expect(moves.nth(i).getByLabel('Best move', { exact: true })).toBeVisible();
    await expect(moves.nth(i).getByLabel('Only move', { exact: true })).toBeVisible();
  }
  await moves.nth(0).click();
  await expect(page.getByTestId('engine-choices').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('engine-choices').locator('li').first()).toContainText('f3');
  await expect(page.getByTestId('played-evaluation')).toHaveText('+0.00');
  await moves.nth(1).click();
  await expect(page.getByTestId('engine-choices').locator('li').nth(1)).toContainText('+0.55');
  await moves.nth(2).click();
  await expect(page.getByTestId('best-move')).toBeVisible(); // 10 CP below the first choice.
  await expect(page.getByTestId('only-move')).toHaveCount(0);
  await expect(page.getByTestId('played-evaluation')).toHaveText('+0.90');
  await moves.nth(3).click();
  await expect(page.getByTestId('only-move')).toBeVisible();
  await expect(page.getByTestId('played-evaluation')).toHaveText('−M1');
  await page.getByLabel('I played as').selectOption('black');
  await expect(moves.nth(0).getByLabel('Only move', { exact: true })).toBeVisible();
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByTestId('best-move')).toHaveText('Bester Zug');
  await expect(page.getByTestId('only-move')).toHaveText('Einziger Zug');
});

test('older saved analysis stays reviewable and can gain engine choices with real Stockfish', async ({ page }) => {
  await seed(page, true);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByTestId('only-move')).toHaveCount(0);
  await page.getByTestId('engine-review').getByRole('button', { name: 'Add engine choices', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  await expect(page.getByTestId('engine-choices').locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('engine-choices').locator('li').first()).toContainText('Qh4#');
  await expect(page.getByTestId('only-move')).toBeVisible();
  await page.reload();
  await page.getByLabel('I played as').selectOption('black');
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('only-move')).toBeVisible();
  await expect(page.getByTestId('engine-choices').locator('li')).toHaveCount(3);
});

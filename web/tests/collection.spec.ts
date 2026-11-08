import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { parseGame } from '../src/game';

const WHITE_FEN = '8/8/8/8/8/1NK5/R6R/1k6 w - - 0 1';
const BLACK_FEN = '8/8/8/8/8/1nk5/r6r/1K6 b - - 0 1';
const SETUP = '8/8/8/8/8/1NK5/R6R/2k5 b - - 0 1';
const virtualPgn = `[Event "Saved virtual discovery"]\n[SetUp "1"]\n[FEN "${SETUP}"]\n\n1... Kb1 1-0`;
function matePgn(fen: string, san: string) {
  return `[SetUp "1"]\n[FEN "${fen}"]\n\n${fen.includes(' b ') ? '1...' : '1.'} ${san} *`;
}
async function load(page: Page, pgn: string) {
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  const summary = page.locator('summary').filter({ hasText: 'Open another page of the notebook' });
  const details = summary.locator('..');
  if (!(await details.evaluate(element => element.hasAttribute('open')))) await summary.click();
  await page.getByLabel('PASTE ONE PGN').fill(pgn);
  await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  await expect(page.getByTestId('status')).not.toHaveAttribute('data-state', 'loading');
}
async function collect(page: Page, color: 'white' | 'black') {
  await page.getByLabel('I played as').selectOption(color);
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
}
async function collection(page: Page) {
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your scrapbook.', exact: true })).toBeVisible();
}

test('rewards are idempotent, color can be corrected, and exact SAN counts combine across colors', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, matePgn(WHITE_FEN, 'Rab2#'));
  await expect(page.getByLabel('I played as')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Collect rewards', exact: true })).toBeDisabled();
  await collect(page, 'white');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collection(page);
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await expect(page.getByTestId('total-badge_moves_played')).toHaveText('1 / 100');
  const scrap = page.getByTestId('scrap-Rab2#');
  await expect(scrap.locator('summary')).toContainText('Real');
  await expect(scrap.getByTestId('real-counts')).toBeHidden();
  await scrap.locator('summary').click();
  await expect(scrap.getByTestId('real-counts')).toHaveText('Real checkmates · White 1 · Black 0');
  await page.reload();
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');

  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await expect(page.getByLabel('I played as')).toHaveValue('white');
  await collect(page, 'black');
  await collection(page);
  await expect(page.getByTestId('scrap-Rab2#')).toHaveCount(0);
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await expect(page.getByTestId('total-badge_moves_played')).toHaveText('0 / 100');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await collect(page, 'white');
  await load(page, matePgn(BLACK_FEN, 'Rab2#'));
  await expect(page.getByLabel('I played as')).toHaveValue('');
  await collect(page, 'black');
  await collection(page);
  await expect(page.getByTestId('scrap-Rab2#')).toHaveCount(1);
  await page.getByTestId('scrap-Rab2#').locator('summary').click();
  await expect(page.getByTestId('scrap-Rab2#').getByTestId('real-counts')).toHaveText('Real checkmates · White 1 · Black 1');
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('2 / 16');

  await load(page, '1. e4 a6 2. e5 d5 3. exd6 1/2-1/2');
  await collect(page, 'white');
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_en_passant')).toHaveText('1');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.getByTestId('replay-badge_en_passant')).toHaveText('0');
  await collection(page);
  await expect(page.getByTestId('total-badge_en_passant')).toHaveText('1 / 2');
  await page.screenshot({ path: info.outputPath('collection.png'), fullPage: true });
});

test('native virtual finish avoids an owned scrap, upgrades to real, and replays frozen evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, virtualPgn);
  await page.getByLabel('I played as').selectOption('white');
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  const first = await page.getByLabel('Virtual continuation', { exact: true }).getByRole('button').last().innerText();
  expect(first).toMatch(/#$/);
  await load(page, matePgn(WHITE_FEN, first));
  await collect(page, 'white');
  await load(page, virtualPgn);
  await page.getByLabel('I played as').selectOption('white');
  await page.getByRole('button', { name: 'Look for another virtual finish', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  const novel = await page.getByLabel('Virtual continuation', { exact: true }).getByRole('button').last().innerText();
  expect(novel).toMatch(/#$/);
  expect(novel).not.toBe(first);
  await collect(page, 'white');
  await collection(page);
  const virtual = page.getByTestId(`scrap-${novel}`);
  await expect(virtual.locator('summary')).toContainText('Virtual');
  await expect(virtual.getByTestId('real-counts')).toBeHidden();
  await virtual.locator('summary').click();
  await expect(virtual.getByTestId('real-counts')).toHaveText('Real checkmates · White 0 · Black 0');

  await load(page, matePgn(WHITE_FEN, novel));
  await collect(page, 'white');
  await collection(page);
  await expect(page.getByTestId(`scrap-${novel}`).locator('summary')).toContainText('Real');
  const card = page.getByTestId(`scrap-${novel}`);
  // The same details node can retain its open state through an upgrade.
  if (!(await card.evaluate(element => element.hasAttribute('open')))) await card.locator('summary').click();
  await expect(card.getByTestId('real-counts')).toHaveText('Real checkmates · White 1 · Black 0');

  // Change the analysis cache to another legal mate. The collected occurrence
  // must keep showing the continuation that actually earned its scrap.
  const pos = Chess.fromSetup(parseFen(parseGame(virtualPgn).frames.at(-1)!.fen).unwrap()).unwrap();
  const move = parseSan(pos, first)!;
  const uci = makeUci(move);
  const san = makeSanAndPlay(pos, move);
  await page.evaluate(async ({ pgn, line }) => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('scrapbook-browser-proof', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('checkpoints', 'readwrite');
      const store = tx.objectStore('checkpoints');
      const request = store.getAll();
      request.onsuccess = () => { const checkpoint = request.result.find((r: { pgn: string }) => r.pgn === pgn); checkpoint.virtual = line; store.put(checkpoint); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { pgn: virtualPgn, line: [{ uci, san, fen: makeFen(pos.toSetup()) }] });
  await card.getByRole('button', { name: /Virtual$/ }).click();
  await expect(page.getByTestId('virtual-status')).toContainText(novel);
  await expect(page.getByTestId('replay-position')).toHaveText('Virtual ply 1');
  await expect(page.getByTestId('played-moves').getByRole('button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
});

test('unfinished games cannot be collected', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, '1. e4 e5 *');
  await page.getByLabel('I played as').selectOption('white');
  await expect(page.getByRole('button', { name: 'Collect rewards', exact: true })).toBeDisabled();
});

test('Mirror Dimension reveals flavor at game end and survives reload, recollection, and color correction', async ({ page }) => {
  const pgn = readFileSync(new URL('../src/fixtures/games/opposite-castling.pgn', import.meta.url), 'utf8');
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, pgn);
  await collect(page, 'white');
  await expect(page.getByTestId('reward-reveal')).toContainText('Mirror Dimension');
  await expect(page.getByTestId('reward-reveal')).toContainText('Separate bedrooms. Shared custody of the center.');
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_opposite_side_casteling')).toHaveText('1');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.getByTestId('replay-badge_opposite_side_casteling')).toHaveText('0');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.getByTestId('replay-position')).toHaveText('Ply 16 / 18');
  await expect(page.getByTestId('replay-badge_opposite_side_casteling')).toHaveText('0');
  await collection(page);
  await expect(page.getByTestId('total-badge_opposite_side_casteling')).toHaveText('1 / 2');
  await page.reload();
  await expect(page.getByTestId('total-badge_opposite_side_casteling')).toHaveText('1 / 2');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await collect(page, 'white');
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collect(page, 'black');
  await collection(page);
  await expect(page.getByTestId('total-badge_opposite_side_casteling')).toHaveText('0 / 1');
});

test('rating badges reveal authored flavor, replay at game end, persist, and correct with player color', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, '[Site "https://lichess.org/Odds0001"]\n[WhiteElo "1700"]\n[BlackElo "1800"]\n\n1. e4 e5 1-0');
  await collect(page, 'white');
  await expect(page.getByTestId('reward-reveal')).toContainText('Their number was bigger. Your point was louder.');
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await expect(page.getByTestId('replay-badge_upset')).toHaveText('1');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.getByTestId('replay-badge_upset')).toHaveText('0');
  await load(page, '[Site "https://lichess.org/Odds0002"]\n[WhiteElo "1700"]\n[BlackElo "1850"]\n\n1. d4 d5 1/2-1/2');
  await collect(page, 'white');
  await expect(page.getByTestId('reward-reveal')).toContainText('They wanted your king. You offered half a point.');
  await collection(page);
  await expect(page.getByTestId('total-badge_upset')).toHaveText('1 / 2');
  await expect(page.getByTestId('total-hold_your_own')).toHaveText('1 / 2');
  await page.reload();
  await expect(page.getByTestId('total-hold_your_own')).toHaveText('1 / 2');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await collect(page, 'white');
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collect(page, 'black');
  await collection(page);
  await expect(page.getByTestId('total-badge_upset')).toHaveText('1 / 2');
  await expect(page.getByTestId('total-hold_your_own')).toHaveText('0 / 1');
});

test('mileage follows Lichess clocks and reveals the hidden ultrabullet badge on collection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await collection(page);
  await expect(page.getByRole('article', { name: 'StarCraft III', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Adderall', exact: true })).toHaveCount(0);
  const controls = [
    ['60+0', 'badge_played_bullet', '1999'],
    ['30+0', 'badge_played_hyperbullet', '30'],
    ['300+0', 'badge_played_blitz', '15'],
    ['300+5', 'badge_played_rapid', '5'],
    ['900+15', 'badge_played_classical', '5'],
    ['15+0', 'badge_played_ultrabullet', '1998'],
  ];
  for (const [index, [clock, id, threshold]] of controls.entries()) {
    await load(page, `[Site "https://lichess.org/Mile000${index}"]\n[TimeControl "${clock}"]\n\n1. e4 e5 1/2-1/2`);
    await collect(page, 'white');
    await page.getByRole('button', { name: 'Last position', exact: true }).click();
    await expect(page.getByTestId(`replay-${id}`)).toHaveText('1');
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await expect(page.getByTestId(`replay-${id}`)).toHaveText('0');
    await collection(page);
    await expect(page.getByTestId(`total-${id}`)).toHaveText(`1 / ${threshold}`);
    await expect(page.getByTestId('total-badge_played_total')).toHaveText(`${index + 1} / 16`);
  }
  await expect(page.getByRole('article', { name: 'StarCraft III', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('total-badge_played_ultrabullet')).toHaveText('1 / 1998');
  await expect(page.getByRole('article', { name: 'Adderall', exact: true })).toBeVisible();
});

test('board badges replay at the played move, persist, and correct with the selected color', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await load(page, '[SetUp "1"]\n[FEN "1r5k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. axb8=R+ Kg7 1/2-1/2');
  await collect(page, 'white');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  for (const id of ['badge_won_total', 'badge_total_checks', 'badge_material_total', 'badge_promotion']) {
    await expect(page.getByTestId(`replay-${id}`)).toHaveText('0');
  }
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByTestId('replay-badge_won_total')).toHaveText('0');
  await expect(page.getByTestId('replay-badge_total_checks')).toHaveText('1');
  await expect(page.getByTestId('replay-badge_material_total')).toHaveText('5');
  await expect(page.getByTestId('replay-badge_promotion')).toHaveText('1');
  await collection(page);
  await expect(page.getByTestId('total-badge_promotion')).toHaveText('1 / 10');
  await expect(page.getByTestId('total-badge_material_total')).toHaveText('5 / 69');
  await expect(page.getByTestId('total-badge_total_checks')).toHaveText('1 / 2');
  await expect(page.getByTestId('total-badge_won_total')).toHaveText('0 / 1');
  await page.reload();
  await expect(page.getByTestId('total-badge_promotion')).toHaveText('1 / 10');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await collect(page, 'white');
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collect(page, 'black');
  await collection(page);
  await expect(page.getByTestId('total-badge_promotion')).toHaveText('0 / 10');
  await expect(page.getByTestId('total-badge_material_total')).toHaveText('0 / 69');
  await expect(page.getByTestId('total-badge_total_checks')).toHaveText('0 / 1');
});

test('two tabs collecting the same game commit one set of contributions', async ({ page, context }) => {
  const second = await context.newPage();
  await Promise.all([page.goto('/'), second.goto('/')]);
  await Promise.all([page, second].map(async tab => {
    await expect(tab.getByTestId('status')).toHaveAttribute('data-state', 'ready');
    await load(tab, matePgn(WHITE_FEN, 'Rab2#'));
    await tab.getByLabel('I played as').selectOption('white');
  }));
  await Promise.all([page, second].map(tab => tab.getByRole('button', { name: 'Collect rewards', exact: true }).click()));
  await collection(page);
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await expect(page.getByTestId('total-badge_moves_played')).toHaveText('1 / 100');
  const scrap = page.getByTestId('scrap-Rab2#');
  await scrap.locator('summary').click();
  await expect(scrap.getByTestId('real-counts')).toHaveText('Real checkmates · White 1 · Black 0');
});

test('the supplied Black game collects actual moves and a separate virtual Qxf1 mate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByLabel('I played as')).toHaveValue('black');
  await expect(page.getByTestId('played-moves').getByRole('button')).toHaveCount(52);
  await collect(page, 'black');
  await collection(page);
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await expect(page.getByTestId('total-badge_moves_played')).toHaveText('26 / 100');
  await expect(page.getByTestId('total-badge_won_total')).toHaveText('1 / 7');
  await expect(page.getByTestId('total-badge_total_checks')).toHaveText('2 / 3');
  await expect(page.getByTestId('total-badge_material_total')).toHaveText('11 / 69');
  await expect(page.locator('.scrap-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', { timeout: 120000 });
  await expect(page.getByTestId('virtual-status')).toHaveText('Black mates with Qxf1# after 2 simulated plies.');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await collection(page);
  await expect(page.getByTestId('total-badge_played_total')).toHaveText('1 / 16');
  await expect(page.getByTestId('total-badge_moves_played')).toHaveText('26 / 100');
  await expect(page.getByTestId('total-badge_total_checks')).toHaveText('2 / 3');
  await expect(page.getByTestId('total-badge_material_total')).toHaveText('11 / 69');
  const scrap = page.getByTestId('scrap-Qxf1#');
  await expect(scrap.locator('summary')).toContainText('Virtual');
  await scrap.locator('summary').click();
  await expect(scrap.getByTestId('real-counts')).toHaveText('Real checkmates · White 0 · Black 0');
});

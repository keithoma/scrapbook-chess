import { expect, test, type Page } from '@playwright/test';

async function example(page: Page, another = false) {
  const summary = page.locator('summary').filter({ hasText: 'Open another page of the notebook' });
  if (!(await summary.locator('..').evaluate((element) => element.hasAttribute('open'))))
    await summary.click();
  if (!another) await page.getByRole('button', { name: 'Fork example', exact: true }).click();
  else {
    const pgn =
      '[White "Another White"]\n[Black "Another Black"]\n[Result "1/2-1/2"]\n[SetUp "1"]\n[FEN "3q3k/8/8/4N3/8/8/8/7K w - - 0 1"]\n\n1. Nf7+ 1/2-1/2';
    await page.getByLabel('PASTE ONE PGN').fill(pgn);
    await page.getByRole('button', { name: 'Load PGN', exact: true }).click();
  }
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await page.getByLabel('I played as').selectOption('white');
  await page
    .getByTestId('fork-inspector')
    .getByRole('button', { name: '1. Nf7+', exact: true })
    .click();
}
async function analyze(page: Page) {
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', {
    timeout: 120000,
  });
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

test('native fork analysis earns XP, levels up, replays progress, and supports color correction', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await example(page);
  await expect(page.getByTestId('fork-award')).toContainText('Mastery XP pending');
  await collect(page);
  await collection(page, 0, 1);
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await analyze(page);
  await expect(page.getByTestId('fork-award')).toContainText('Qualified fork · +137 XP');
  await expect(page.getByTestId('fork-grade')).toHaveText('Fork grade: S+');
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
  await expect(page.getByTestId('fork-grade')).toHaveText('Fork grade: S+');

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

test('two tabs save one XP award and collected evidence survives checkpoint eviction', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await example(page);
  await analyze(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('status')).toHaveAttribute('data-state', 'complete');
  await second.getByLabel('I played as').selectOption('white');
  await Promise.all([page, second].map((tab) => collect(tab)));
  await collection(page, 137, 1);
  await second.close();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('scrapbook-browser-proof');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('137 XP');
  await page.getByTestId('fork-mastery').locator('summary').click();
  await page.getByRole('button', { name: 'Replay fork', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('fork-award')).toContainText('Collected +137 XP');
  await expect(page.getByTestId('fork-grade')).toHaveText('Fork grade: S+');
  await expect(page.getByTestId('fork-engine')).toContainText('Best move');
  await collect(page);
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await collection(page, 137, 1);
});

test('XP keeps accumulating behind the S-grade gate and two collected high grades unlock level six', async ({
  page,
}) => {
  await page.goto('/collection');
  await expect(page.getByRole('heading', { name: 'Your scrapbook.', exact: true })).toBeVisible();
  const records = Array.from({ length: 32 }, (_, index) => ({
    id: `lichess:Gate${String(index).padStart(4, '0')}`,
    version: 1,
    pgn: `[Site "https://lichess.org/Gate${String(index).padStart(4, '0')}"]\n[SetUp "1"]\n[FEN "3r3k/8/8/4N3/8/8/7K/3r4 w - - 0 1"]\n\n1. Nf7+ 1-0`,
    color: 'white',
    collectedAt: '',
    updatedAt: '',
    events: [
      {
        kind: 'mastery',
        masteryId: 'mastery_knight_forks',
        amount: 89,
        ply: 1,
        grade: 'A+',
        evidence: {
          ruleVersion: 'knight-forks-v1',
          gradeVersion: 'fork-grades-v1',
          analysisVersion: 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1',
          best: { type: 'cp', value: 200 },
          played: { type: 'cp', value: 189 },
          bestMove: 'Nf7+',
          lossCp: 11,
          materialGainCp: 200,
          reply: 'Kg7',
          capture: 'Nxd8',
        },
      },
    ],
  }));
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scrapbook-local-collection', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('games', 'readwrite');
        for (const record of records) tx.objectStore('games').put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, records);
  await page.reload();
  await collection(page, 2848, 5);
  await expect(page.getByTestId('mastery-xp-requirement')).toHaveText(
    'XP requirement met. Extra XP is saved.',
  );
  await expect(page.getByTestId('mastery-grade-requirement')).toHaveText(
    '0 / 2 forks rated S- or better for level 6',
  );
  for (const [another, xp, level] of [
    [false, 2985, 5],
    [true, 3122, 6],
  ] as const) {
    await page.getByRole('link', { name: 'Notebook', exact: true }).click();
    await example(page, another);
    await analyze(page);
    await expect(page.getByTestId('fork-grade')).toHaveText('Fork grade: S+');
    await collect(page);
    if (level === 6)
      await expect(page.getByTestId('reward-reveal')).toContainText(
        'Knight forks reached level 6!',
      );
    await collection(page, xp, level);
  }
  await expect(page.getByTestId('mastery-high-grades')).toHaveText('Forks rated S- or better: 2');
  await expect(page.getByTestId('mastery-grade-requirement')).toHaveText(
    '0 / 3 forks rated S- or better for level 7',
  );
  await page.reload();
  await collection(page, 3122, 6);
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByTestId('mastery-grade-requirement')).toHaveText(
    '0 / 3 Gabeln mit S- oder besser für Stufe 7',
  );
});

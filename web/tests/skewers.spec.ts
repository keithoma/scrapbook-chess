import { expect, test } from '@playwright/test';

test('native skewers earn their own grades, XP and replay evidence without mixing fork progress', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  const summary = page.locator('summary').filter({ hasText: 'Open another page of the notebook' });
  if (!(await summary.locator('..').evaluate((e) => e.hasAttribute('open')))) await summary.click();
  await page.getByRole('button', { name: 'Skewer example', exact: true }).click();
  await page.getByLabel('I played as').selectOption('white');
  await page.getByTestId('skewer-inspector').getByRole('button', { name: /Bb2/ }).click();
  await expect(page.locator('[data-skewer-source="true"]')).toHaveCount(1);
  await expect(page.locator('[data-skewer-target="true"]')).toHaveCount(2);
  await expect(page.getByTestId('skewer-award')).toContainText('Skewer XP pending');
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', {
    timeout: 120000,
  });
  await expect(page.getByTestId('skewer-grade')).toHaveText(/^Skewer grade: [DCBAS][+-]?$/);
  const savedGrade = (await page.getByTestId('skewer-grade').textContent())!;
  const awardText = (await page.getByTestId('skewer-award').textContent())!;
  const skewerXp = Number(awardText.match(/Qualified skewer · \+(\d+) XP/)?.[1]);
  expect(skewerXp).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText(`Skewers +${skewerXp} XP`);
  await expect(page.getByTestId('replay-skewer-xp')).toHaveText(`Skewers +${skewerXp} XP`);
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(page.getByTestId('replay-skewer-xp')).toHaveText('Skewers +0 XP');
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByTestId('skewer-total-xp')).toHaveText(`${skewerXp} XP`);
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('0 XP');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  if (!(await summary.locator('..').evaluate((e) => e.hasAttribute('open')))) await summary.click();
  await page.getByRole('button', { name: 'Fork example', exact: true }).click();
  await page.getByLabel('I played as').selectOption('white');
  await page.getByRole('button', { name: 'Analyze this game', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'complete', {
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('Knight forks +137 XP');
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByTestId('skewer-total-xp')).toHaveText(`${skewerXp} XP`);
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('137 XP');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase('scrapbook-browser-proof');
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
  await page.reload();
  await expect(page.getByTestId('skewer-total-xp')).toHaveText(`${skewerXp} XP`);
  await page.getByTestId('skewer-mastery').locator('summary').click();
  await expect(page.getByTestId('collected-skewer-grade')).toHaveText(savedGrade);
  await page.getByRole('button', { name: 'Replay skewer', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('skewer-grade')).toHaveText(savedGrade);
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toContainText('No progress was counted twice.');
  await page.getByLabel('I played as').selectOption('black');
  await page.getByRole('button', { name: 'Collect rewards', exact: true }).click();
  await expect(page.getByTestId('reward-reveal')).toBeVisible();
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.getByTestId('skewer-total-xp')).toHaveText('0 XP');
  await expect(page.getByTestId('mastery-total-xp')).toHaveText('137 XP');
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByTestId('skewer-mastery')).toContainText('Spieße');
});

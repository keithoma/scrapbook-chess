import { expect, test } from '@playwright/test';

test('timezone settings persist separately for guest and profile, validate, and translate', async ({ page }) => {
  await page.request.post('/api/__test/reset');
  await page.goto('/settings');
  await page.getByLabel('Time zone', { exact: true }).fill('America/New_York');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved.');
  await page.reload();
  await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('America/New_York');
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Use local mock login', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Time zone', { exact: true }).fill('Europe/Berlin');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved.');
  expect((await (await page.request.get('/api/me')).json()).user.timeZone).toBe('Europe/Berlin');
  await page.reload();
  await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('Europe/Berlin');
  await page.getByLabel('Time zone', { exact: true }).fill('Mars/Olympus');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Choose a valid time zone.');
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  await expect(page.getByLabel('Zeitzone', { exact: true })).toBeVisible();
});

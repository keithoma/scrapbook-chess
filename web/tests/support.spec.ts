import { expect, test } from '@playwright/test';

test('language selection, empty help, and local feedback drafts survive navigation and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { name: 'Deine Partien.' })).toBeVisible();
  await page.getByRole('link', { name: 'Hilfe', exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByText('Es gibt noch keine Hilfeartikel.')).toBeVisible();
  await page.getByRole('link', { name: 'Feedback', exact: true }).click();
  await page.getByLabel('Dein Feedback').fill('Bitte mehr Springer!');
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await expect(page.getByText('Entwurf auf diesem Gerät gespeichert. Er wurde nicht gesendet.')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByLabel('Dein Feedback')).toHaveValue('Bitte mehr Springer!');
  await page.getByRole('combobox', { name: 'Sprache' }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear draft' }).click();
  await page.reload();
  await expect(page.getByLabel('Your feedback')).toHaveValue('');
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/feedback$/);
});

test.describe('browser language detection', () => {
  test.use({ locale: 'de-DE' });
  test('uses German before a preference is chosen', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { name: 'Hilfe', exact: true })).toBeVisible();
  });
});

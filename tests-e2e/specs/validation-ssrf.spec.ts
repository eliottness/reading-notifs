import { test, expect, login } from '../fixtures/test-base.js';

test.beforeEach(async ({ page }) => {
  await login(page, 'validation@example.com');
});

test('private/SSRF and non-adapter chapter URLs are rejected', async ({ page }) => {
  // Private/loopback/link-local hosts → SSRF guard → 422 "Invalid URL".
  for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1/admin']) {
    await page.goto('/add-work');
    await page.selectOption('#siteId', { label: 'MangaDex' });
    await page.fill('#title', 'SSRF');
    await page.fill('#chapterListUrl', url);
    await page.click('button[type=submit]');
    await expect(page.locator('.alert-error'), `expected rejection for ${url}`).toContainText(
      'Invalid URL',
    );
  }

  // Public but unsupported host → no adapter → 422 "supported site".
  await page.goto('/add-work');
  await page.selectOption('#siteId', { label: 'MangaDex' });
  await page.fill('#title', 'Unknown');
  await page.fill('#chapterListUrl', 'https://example.com/manga/unknown');
  await page.click('button[type=submit]');
  await expect(page.locator('.alert-error')).toContainText('supported site');
});

test('an invalid Discord webhook URL is not saved', async ({ page }) => {
  await page.goto('/notifications');
  await page.fill('#webhookUrl', 'http://evil.com/hook');
  await page.getByRole('button', { name: 'Save Discord webhook' }).click();
  // Rejected server-side: redirected back with no channel persisted.
  await expect(page.getByRole('button', { name: 'Remove Discord webhook' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Discord webhook' })).toBeVisible();
});

test('missing required fields produce a validation error', async ({ page }) => {
  await page.goto('/add-work');
  // Strip HTML5 constraints so the empty submission reaches the server-side validation.
  await page.evaluate(() =>
    document.querySelectorAll('[required]').forEach((el) => el.removeAttribute('required')),
  );
  await page.click('button[type=submit]');
  await expect(page.locator('.alert-error')).toContainText('required');
});

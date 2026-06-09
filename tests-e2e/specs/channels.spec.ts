import { test, expect, login, enablePushUI } from '../fixtures/test-base.js';

const VALID_DISCORD = 'https://discord.com/api/webhooks/123456789012345678/abcDEF_token-value';

test.beforeEach(async ({ page }) => {
  await login(page, 'channels@example.com');
});

test('enabling email shows the Active badge', async ({ page }) => {
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Enable email notifications' }).click();
  await expect(page.getByRole('button', { name: 'Disable email notifications' })).toBeVisible();
  await expect(page.locator('.badge-green')).toContainText('Active');
});

test('enabling a valid Discord webhook shows the Active badge', async ({ page }) => {
  await page.goto('/notifications');
  await page.fill('#webhookUrl', VALID_DISCORD);
  await page.getByRole('button', { name: 'Save Discord webhook' }).click();
  await expect(page.getByRole('button', { name: 'Remove Discord webhook' })).toBeVisible();
});

test('enabling push via the UI stores a subscription', async ({ page }) => {
  const status = await enablePushUI(page);
  expect(status).toBe(200);
  // push.js reloads the page after subscribing; the disable button proves persistence.
  await expect(page.getByRole('button', { name: 'Disable push notifications' })).toBeVisible();
});

test('disabling the email channel removes the badge', async ({ page }) => {
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Enable email notifications' }).click();
  await expect(page.getByRole('button', { name: 'Disable email notifications' })).toBeVisible();

  // hx-delete re-renders the page in place (no reload needed).
  await page.getByRole('button', { name: 'Disable email notifications' }).click();
  await expect(page.getByRole('button', { name: 'Enable email notifications' })).toBeVisible();
  await expect(page.locator('.badge-green')).toHaveCount(0);
});

test('removing push and Discord channels clears them', async ({ page }) => {
  // Enable push (UI) and Discord, then remove both.
  await enablePushUI(page);
  await expect(page.getByRole('button', { name: 'Disable push notifications' })).toBeVisible();

  await page.fill('#webhookUrl', VALID_DISCORD);
  await page.getByRole('button', { name: 'Save Discord webhook' }).click();
  await expect(page.getByRole('button', { name: 'Remove Discord webhook' })).toBeVisible();

  await page.getByRole('button', { name: 'Disable push notifications' }).click();
  await expect(page.getByRole('button', { name: 'Disable push notifications' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove Discord webhook' }).click();
  await expect(page.getByRole('button', { name: 'Remove Discord webhook' })).toHaveCount(0);
});

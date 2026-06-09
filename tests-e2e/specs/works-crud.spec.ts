import { test, expect, login, addWork } from '../fixtures/test-base.js';

const md = (slug: string) => `https://mangadex.org/title/${slug}`;

test.beforeEach(async ({ page }) => {
  await login(page, 'works@example.com');
});

test('add-work form lists seeded sites (MangaDex)', async ({ page }) => {
  await page.goto('/add-work');
  await expect(page.locator('h1')).toHaveText('Add a Work');
  await expect(page.locator('#siteId option', { hasText: 'MangaDex' })).toHaveCount(1);
});

test('adding a valid MangaDex work shows it on the dashboard', async ({ page }) => {
  await addWork(page, { title: 'Solo Leveling', url: md('solo-leveling') });
  await expect(page.locator('#work-list')).toContainText('Solo Leveling');
});

test('adding a second work shows both on the dashboard', async ({ page }) => {
  await addWork(page, { title: 'One Piece', url: md('one-piece') });
  await addWork(page, { title: 'Berserk', url: md('berserk') });
  await expect(page.locator('#work-list')).toContainText('One Piece');
  await expect(page.locator('#work-list')).toContainText('Berserk');
  await expect(page.locator('#work-list .card')).toHaveCount(2);
});

test('deleting a work removes it from the dashboard', async ({ page }) => {
  await addWork(page, { title: 'To Delete', url: md('to-delete') });
  await expect(page.locator('#work-list')).toContainText('To Delete');

  page.on('dialog', (d) => d.accept()); // accept the hx-confirm prompt
  // DELETE returns 200 so htmx's hx-swap="delete" removes the card in place.
  await page.click('.card:has-text("To Delete") button.btn-danger');
  await expect(page.locator('#work-list .card')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('To Delete');
});

test('empty dashboard shows the empty state', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('.card')).toContainText('No works tracked yet');
});

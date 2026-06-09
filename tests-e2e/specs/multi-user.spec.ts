import { test, expect, login, addWork, listWorks } from '../fixtures/test-base.js';

const md = (slug: string) => `https://mangadex.org/title/${slug}`;

test('user A cannot see or delete user B works', async ({ page, browser }) => {
  await login(page, 'a@example.com'); // page = user A

  const ctxB = await browser.newContext({ permissions: ['notifications'] });
  const pageB = await ctxB.newPage();
  try {
    await login(pageB, 'b@example.com');
    await addWork(pageB, { title: 'B Secret Work', url: md('b-secret') });

    // A's dashboard must not show B's work.
    await page.goto('/dashboard');
    await expect(page.locator('body')).not.toContainText('B Secret Work');

    // A attempts to delete B's work — must be a no-op for the non-owner.
    const [work] = await listWorks(pageB, 'b@example.com');
    await page.request.delete(`/works/${work.id}`);

    await pageB.goto('/dashboard');
    await expect(pageB.locator('#work-list')).toContainText('B Secret Work');
  } finally {
    await ctxB.close();
  }
});

test('per-user notification channels are isolated', async ({ page, browser }) => {
  await login(page, 'a2@example.com');

  const ctxB = await browser.newContext({ permissions: ['notifications'] });
  const pageB = await ctxB.newPage();
  try {
    await login(pageB, 'b2@example.com');

    // A enables email.
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Enable email notifications' }).click();
    await expect(page.getByRole('button', { name: 'Disable email notifications' })).toBeVisible();

    // B sees no active channels.
    await pageB.goto('/notifications');
    await expect(pageB.getByRole('button', { name: 'Enable email notifications' })).toBeVisible();
    await expect(pageB.locator('.badge-green')).toHaveCount(0);
  } finally {
    await ctxB.close();
  }
});

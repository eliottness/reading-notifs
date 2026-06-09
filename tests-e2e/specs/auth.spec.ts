import { test, expect, login, getEmails } from '../fixtures/test-base.js';

// Decode quoted-printable MIME so the magic-link verify URL can be extracted from the raw email.
function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex as string, 16)));
}

test('login page renders the magic-link form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('h1')).toHaveText('Sign in');
  await expect(page.locator('#login-form')).toHaveAttribute('hx-post', '/auth/send-magic-link');
  await expect(page.locator('input#email')).toBeVisible();
});

test('test-login establishes a session and reaches the dashboard', async ({ page }) => {
  await login(page, 'session@example.com');
  await page.goto('/dashboard');
  await expect(page.locator('h1')).toHaveText('My Works');
});

test('real magic-link flow: request link, follow emailed verify URL, reach dashboard', async ({
  page,
}) => {
  const email = 'magic@example.com';
  await page.goto('/login');
  await page.fill('input#email', email);
  await page.click('button[type=submit]');
  await expect(page.locator('.alert-success')).toContainText('Check your email');

  // Poll the in-process mock SMTP for the captured email, then extract the real verify URL.
  let verifyUrl: string | undefined;
  await expect
    .poll(
      async () => {
        const emails = await getEmails(page, email);
        if (!emails.length) return false;
        const decoded = decodeQP(emails[0].body);
        const m = decoded.match(/https?:\/\/localhost:\d+\/api\/auth\/[^\s<>"]+/);
        if (m) verifyUrl = m[0].replace(/[>\s.,]+$/, '');
        return Boolean(verifyUrl);
      },
      { timeout: 8000 },
    )
    .toBe(true);

  await page.goto(verifyUrl!);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('h1')).toHaveText('My Works');
});

test('unauthenticated visit to /dashboard redirects to /login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('h1')).toHaveText('Sign in');
});

test('signing out clears the session', async ({ page }) => {
  await login(page, 'logout@example.com');
  await page.goto('/dashboard');
  await expect(page.locator('h1')).toHaveText('My Works');

  // better-auth requires an application/json Content-Type; passing `data` sets it.
  const res = await page.request.post('/api/auth/sign-out', { data: {} });
  expect(res.ok()).toBeTruthy();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

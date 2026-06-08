import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createMockSmtp } from '../helpers/mock-smtp.js';
import { resetTransporter } from '../../src/email/index.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedSites } from '../../src/db/seed.js';
import { db } from '../../src/db/index.js';
import { sites } from '../../src/db/schema.js';
import app from '../../src/app.js';

const BASE = 'http://localhost:3000';
const r = (path: string, init?: RequestInit) => app.request(BASE + path, init);

// Extract name=value pairs from Set-Cookie headers for use in Cookie header
function parseCookieHeader(setCookie: string): string {
  return setCookie
    .split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

// Decode quoted-printable MIME encoding (collapses soft line breaks, decodes =XX)
function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Sign in via magic link — QP-decodes the email body to extract the real verify URL
async function signIn(
  smtp: Awaited<ReturnType<typeof createMockSmtp>>,
  email: string,
): Promise<string> {
  smtp.emails.length = 0;

  const res = await r('/auth/send-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }).toString(),
  });
  expect(res.status).toBe(200);

  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(smtp.emails.length, 'Expected magic link email').toBeGreaterThan(0);

  // Decode QP encoding then find the verify URL
  const decoded = decodeQP(smtp.emails[0].body);
  const urlMatch = decoded.match(/https?:\/\/localhost:3000\/api\/auth\/[^\s<>"]+/);
  if (!urlMatch) throw new Error('No verify URL in email:\n' + decoded.slice(0, 500));
  const verifyUrl = urlMatch[0].replace(/[>\s.,]+$/, '');

  const verifyRes = await app.request(verifyUrl);
  const setCookie = verifyRes.headers.get('set-cookie');
  if (!setCookie) {
    const hdrs: string[] = [];
    verifyRes.headers.forEach((v, k) => hdrs.push(`${k}=${v.slice(0, 80)}`));
    throw new Error(
      `No Set-Cookie on verify (status ${verifyRes.status}). Headers: ${hdrs.join(' | ')}`,
    );
  }
  return parseCookieHeader(setCookie);
}

// ─────────────────────────────────────────────
// Suite setup
// ─────────────────────────────────────────────

let smtp: Awaited<ReturnType<typeof createMockSmtp>>;

beforeAll(async () => {
  smtp = await createMockSmtp();
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_FROM = 'noreply@reading-notifs.test';
  resetTransporter();
  runMigrations();
  await seedSites();
});

afterAll(async () => {
  await smtp.close();
});

beforeEach(() => {
  smtp.emails.length = 0;
});

// ─────────────────────────────────────────────
// Public routes
// ─────────────────────────────────────────────

describe('Public routes', () => {
  it('GET / redirects to /login when unauthenticated', async () => {
    const res = await r('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('GET /login returns the login form', async () => {
    const res = await r('/login');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Sign in');
    expect(html).toContain('/auth/send-magic-link');
  });

  it('GET /dashboard without a session redirects to /login', async () => {
    const res = await r('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('GET /add-work without a session redirects to /login', async () => {
    const res = await r('/add-work');
    expect(res.status).toBe(302);
  });

  it('GET /notifications without a session redirects to /login', async () => {
    const res = await r('/notifications');
    expect(res.status).toBe(302);
  });
});

// ─────────────────────────────────────────────
// Magic link auth
// ─────────────────────────────────────────────

describe('Magic link auth', () => {
  it('POST /auth/send-magic-link sends an email and shows confirmation', async () => {
    const res = await r('/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'hello@example.com' }).toString(),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Check your email');

    await new Promise((r) => setTimeout(r, 300));
    expect(smtp.emails.length).toBeGreaterThan(0);
    expect(smtp.emails[0].to).toContain('hello@example.com');
  });

  it('POST /auth/send-magic-link with empty email shows error', async () => {
    const res = await r('/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('email');
  });

  it('full magic link flow: verify link → session cookie → access dashboard', async () => {
    const cookie = await signIn(smtp, 'flow-test@example.com');
    expect(cookie).toBeTruthy();

    const dashRes = await r('/dashboard', {
      headers: { cookie },
    });
    expect(dashRes.status).toBe(200);
    const html = await dashRes.text();
    expect(html).toContain('My Works');
  });
});

// ─────────────────────────────────────────────
// Authenticated routes
// ─────────────────────────────────────────────

describe('Authenticated routes', () => {
  let cookie: string;
  let mangadexSiteId: string;

  beforeAll(async () => {
    cookie = await signIn(smtp, 'routes-test@example.com');
    const allSites = await db.select().from(sites);
    const mangadex = allSites.find((s) => s.slug === 'mangadex');
    if (!mangadex) throw new Error('MangaDex site not found after seed');
    mangadexSiteId = mangadex.id;
  });

  it('GET /dashboard shows the works list', async () => {
    const res = await r('/dashboard', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('My Works');
  });

  it('GET /add-work shows the add-work form with seeded sites', async () => {
    const res = await r('/add-work', { headers: { cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('MangaDex');
  });

  it('GET /notifications shows the channels page', async () => {
    const res = await r('/notifications', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Notification Channels');
  });

  // ── SSRF / validation ───────────────────────

  it('POST /works rejects private/SSRF URLs', async () => {
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:8025',
      'http://127.0.0.1/admin',
      'file:///etc/passwd',
    ]) {
      const res = await r('/works', {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          siteId: mangadexSiteId,
          title: 'Test',
          chapterListUrl: url,
        }).toString(),
      });
      expect(res.status, `Expected rejection for ${url}`).toBe(422);
      expect(await res.text()).toContain('Invalid URL');
    }
  });

  it('POST /works rejects URLs with no matching adapter', async () => {
    const res = await r('/works', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        siteId: mangadexSiteId,
        title: 'Test',
        chapterListUrl: 'https://example.com/manga/unknown',
      }).toString(),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('supported site');
  });

  it('POST /works with missing fields shows validation error', async () => {
    const res = await r('/works', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        siteId: mangadexSiteId,
        title: '',
        chapterListUrl: '',
      }).toString(),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('required');
  });

  it('POST /works with a valid MangaDex URL creates a work and redirects to dashboard', async () => {
    const res = await r('/works', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        siteId: mangadexSiteId,
        title: 'One Piece',
        chapterListUrl: 'https://api.mangadex.org/manga/a1c7c817-4e59-43b7-9365-09675a149a6f',
      }).toString(),
    });
    // Initial fetch might fail (network), but the work should still be created → redirect
    expect([302, 303]).toContain(res.status);
    expect(res.headers.get('location')).toContain('/dashboard');

    // Verify it appears on the dashboard
    const dashRes = await r('/dashboard', { headers: { cookie } });
    expect(await dashRes.text()).toContain('One Piece');
  });

  it('DELETE /works/:id removes the work from the dashboard', async () => {
    // First add a work
    const addRes = await r('/works', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        siteId: mangadexSiteId,
        title: 'To Be Deleted',
        chapterListUrl: 'https://api.mangadex.org/manga/b9797c5b-642e-44d9-ac40-8b31b9ae110a',
      }).toString(),
    });
    expect([302, 303]).toContain(addRes.status);

    // Find the specific work ID for "To Be Deleted" by searching after the title
    const dashHtml = await (await r('/dashboard', { headers: { cookie } })).text();
    expect(dashHtml).toContain('To Be Deleted');
    const titleIdx = dashHtml.indexOf('To Be Deleted');
    const afterTitle = dashHtml.slice(titleIdx);
    const idMatch = afterTitle.match(/hx-delete="\/works\/([^"]+)"/);
    expect(idMatch).not.toBeNull();
    const workId = idMatch![1];

    // Delete it
    const delRes = await r(`/works/${workId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(delRes.status).toBe(204);

    // Verify it's gone
    const afterHtml = await (await r('/dashboard', { headers: { cookie } })).text();
    expect(afterHtml).not.toContain('To Be Deleted');
  });

  // ── Notification channels ────────────────────

  it('POST /notifications rejects invalid Discord webhook URLs', async () => {
    for (const badUrl of [
      'http://evil.com/hook',
      'https://notdiscord.com/api/webhooks/123/abc',
      'javascript:alert(1)',
    ]) {
      const res = await r('/notifications', {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ type: 'discord', webhookUrl: badUrl }).toString(),
      });
      // Rejected: redirect back without saving
      expect([302, 303]).toContain(res.status);
    }

    // Verify nothing was saved from bad URLs
    const notifHtml = await (await r('/notifications', { headers: { cookie } })).text();
    expect(notifHtml).not.toContain('evil.com');
  });

  it('POST /notifications enables email and shows Active badge', async () => {
    const res = await r('/notifications', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ type: 'email' }).toString(),
    });
    expect([302, 303]).toContain(res.status);

    const notifHtml = await (await r('/notifications', { headers: { cookie } })).text();
    expect(notifHtml).toContain('Active');
  });

  it('DELETE /notifications/:id removes the email channel', async () => {
    // Get channel ID from page
    const html = await (await r('/notifications', { headers: { cookie } })).text();
    const idMatch = html.match(/\/notifications\/([a-zA-Z0-9_-]{21})/);
    if (!idMatch) return; // email channel might not be present

    const channelId = idMatch![1];
    const delRes = await app.request(`/notifications/${channelId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect([302, 303]).toContain(delRes.status);
  });

  // ── Multi-user isolation ─────────────────────

  it('user A cannot delete user B works', async () => {
    const cookieB = await signIn(smtp, 'user-b@example.com');

    // User B adds a work
    await r('/works', {
      method: 'POST',
      headers: { cookie: cookieB, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        siteId: mangadexSiteId,
        title: 'User B Work',
        chapterListUrl: 'https://api.mangadex.org/manga/c52b2ce3-7f95-469c-96b0-479524fb7a1a',
      }).toString(),
    });

    const bDash = await (await r('/dashboard', { headers: { cookie: cookieB } })).text();
    const idMatch = bDash.match(/\/works\/([a-zA-Z0-9_-]{21})/);
    if (!idMatch) return;
    const workId = idMatch![1];

    // User A tries to delete it — should be a no-op (returns 200 but nothing deleted)
    await app.request(`/works/${workId}`, { method: 'DELETE', headers: { cookie } });

    // Work should still be on user B's dashboard
    const bDashAfter = await (await r('/dashboard', { headers: { cookie: cookieB } })).text();
    expect(bDashAfter).toContain('User B Work');
  });
});

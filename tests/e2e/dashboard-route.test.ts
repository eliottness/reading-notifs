import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createMockSmtp } from '../helpers/mock-smtp.js';
import { resetTransporter } from '../../src/email/index.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedSites } from '../../src/db/seed.js';
import { db } from '../../src/db/index.js';
import { sites, works, subscriptions, user as userTable } from '../../src/db/schema.js';
import app from '../../src/app.js';

const BASE = 'http://localhost:3000';
const r = (path: string, init?: RequestInit) => app.request(BASE + path, init);

function parseCookieHeader(setCookie: string): string {
  return setCookie
    .split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Sign in via the real magic-link flow (mock SMTP), returning a Cookie header string.
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
  expect(smtp.emails.length, 'expected magic link email').toBeGreaterThan(0);

  const decoded = decodeQP(smtp.emails[0].body);
  const urlMatch = decoded.match(/https?:\/\/localhost:3000\/api\/auth\/[^\s<>"]+/);
  if (!urlMatch) throw new Error('no verify URL in email');
  const verifyUrl = urlMatch[0].replace(/[>\s.,]+$/, '');

  const verifyRes = await app.request(verifyUrl);
  const setCookie = verifyRes.headers.get('set-cookie');
  if (!setCookie) throw new Error('no session cookie issued on verify');
  return parseCookieHeader(setCookie);
}

let smtp: Awaited<ReturnType<typeof createMockSmtp>>;
let mangadexSiteId: string;

beforeAll(async () => {
  smtp = await createMockSmtp();
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_FROM = 'noreply@reading-notifs.test';
  resetTransporter();
  runMigrations();
  await seedSites();
  const site = await db.select().from(sites).where(eq(sites.slug, 'mangadex')).get();
  if (!site) throw new Error('mangadex site not seeded');
  mangadexSiteId = site.id;
});

afterAll(async () => {
  await smtp.close();
});

describe('GET /dashboard — refresh metadata rendering', () => {
  it('renders the new-chapter time and the failure badge + message for a subscribed work', async () => {
    const email = 'dash-meta@example.com';
    const cookie = await signIn(smtp, email);

    // Resolve the user the magic-link flow created, then subscribe them to a work carrying both a
    // detected new chapter and a failed last refresh.
    const u = await db.select().from(userTable).where(eq(userTable.email, email)).get();
    if (!u) throw new Error('user not created by sign-in');

    const workId = nanoid();
    await db.insert(works).values({
      id: workId,
      siteId: mangadexSiteId,
      title: 'Berserk',
      chapterListUrl: `https://mangadex.org/title/${workId}`,
      currentChapterCount: 374,
      lastCheckedAt: new Date('2026-06-10T09:00:00Z'),
      lastNewChapterAt: new Date('2026-06-09T18:30:00Z'),
      lastRefreshStatus: 'error',
      lastRefreshErrorMessage: 'fetch timed out after 30s',
      pollingLock: 0,
      createdAt: new Date('2026-05-01T00:00:00Z'),
    });
    await db.insert(subscriptions).values({
      id: nanoid(),
      userId: u.id,
      workId,
      createdAt: new Date(),
    });

    const res = await r('/dashboard', { headers: { cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('Berserk');
    expect(html).toContain('374 chapters');
    expect(html).toContain('New chapter');
    expect(html).toContain('Refresh failed');
    expect(html).toContain('fetch timed out after 30s');
    expect(html).toContain('badge-red');
  });

  it('shows no failure badge for a healthy subscribed work', async () => {
    const email = 'dash-healthy@example.com';
    const cookie = await signIn(smtp, email);

    const u = await db.select().from(userTable).where(eq(userTable.email, email)).get();
    if (!u) throw new Error('user not created by sign-in');

    const workId = nanoid();
    await db.insert(works).values({
      id: workId,
      siteId: mangadexSiteId,
      title: 'Vinland Saga',
      chapterListUrl: `https://mangadex.org/title/${workId}`,
      currentChapterCount: 210,
      lastCheckedAt: new Date('2026-06-10T09:00:00Z'),
      lastRefreshStatus: 'success',
      pollingLock: 0,
      createdAt: new Date('2026-05-01T00:00:00Z'),
    });
    await db.insert(subscriptions).values({
      id: nanoid(),
      userId: u.id,
      workId,
      createdAt: new Date(),
    });

    const res = await r('/dashboard', { headers: { cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('Vinland Saga');
    expect(html).not.toContain('Refresh failed');
  });
});

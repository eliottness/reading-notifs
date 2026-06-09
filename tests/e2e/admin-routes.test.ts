import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createMockSmtp } from '../helpers/mock-smtp.js';
import { resetTransporter } from '../../src/email/index.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedSites } from '../../src/db/seed.js';
import { db } from '../../src/db/index.js';
import { sites, works } from '../../src/db/schema.js';
import app from '../../src/app.js';

// Stage fetch content per URL without TEST_MODE or the live network: mock the fetcher module so
// checkWork's getFetcher returns staged content. vi.hoisted lets the (hoisted) mock factory close
// over the map. The mangadex adapter parses this JSON, so chapter counts are fully deterministic.
const { staged } = vi.hoisted(() => ({ staged: new Map<string, string>() }));
vi.mock('../../src/fetchers/index.js', () => ({
  getFetcher: () => ({
    async fetch(url: string): Promise<string> {
      const content = staged.get(url);
      if (content === undefined) throw new Error(`no staged content for ${url}`);
      return content;
    },
  }),
  __setTestFetchOverride: () => {},
}));

const BASE = 'http://localhost:3000';
const r = (path: string, init?: RequestInit) => app.request(BASE + path, init);

interface RefreshBody {
  ok: boolean;
  changed?: boolean;
  reason?: string;
  previousChapterCount?: number | null;
  currentChapterCount?: number | null;
  refreshedAt?: string;
}

const ADMIN_EMAIL = 'admin@test.dev';
const NON_ADMIN_EMAIL = 'user@test.dev';

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
async function signIn(email: string): Promise<string> {
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

// Build a MangaDex aggregate JSON payload the mangadex adapter parses to exactly `n` chapters.
function mangadexContent(n: number): string {
  const chapters: Record<string, unknown> = {};
  for (let i = 1; i <= n; i++) chapters[String(i)] = {};
  return JSON.stringify({ result: 'ok', volumes: { '1': { chapters } } });
}

let mangadexSiteId: string;

async function createWork(currentChapterCount: number): Promise<{ id: string; url: string }> {
  const id = nanoid();
  const url = `https://mangadex.org/title/${id}`;
  await db.insert(works).values({
    id,
    siteId: mangadexSiteId,
    title: 'Test Work',
    chapterListUrl: url,
    currentChapterCount,
    pollingLock: 0,
    createdAt: new Date(),
  });
  return { id, url };
}

let smtp: Awaited<ReturnType<typeof createMockSmtp>>;

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

beforeEach(() => {
  staged.clear();
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
});

describe('POST /admin/refresh/:workId — authorization', () => {
  it('returns 401 for an anonymous request', async () => {
    const { id } = await createWork(2);
    const res = await r(`/admin/refresh/${id}`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const { id } = await createWork(2);
    const cookie = await signIn(NON_ADMIN_EMAIL);
    const res = await r(`/admin/refresh/${id}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(403);
  });

  it('returns 403 for the admin when ADMIN_EMAILS is empty (fail closed)', async () => {
    const { id } = await createWork(2);
    const cookie = await signIn(ADMIN_EMAIL);
    process.env.ADMIN_EMAILS = '';
    const res = await r(`/admin/refresh/${id}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/refresh/:workId — behavior (admin)', () => {
  it('refreshes and reports changed=true when new chapters are found', async () => {
    const { id, url } = await createWork(2);
    staged.set(url, mangadexContent(3));
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await r(`/admin/refresh/${id}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RefreshBody;
    expect(body.ok).toBe(true);
    expect(body.changed).toBe(true);
    expect(body.previousChapterCount).toBe(2);
    expect(body.currentChapterCount).toBe(3);

    const row = await db.select().from(works).where(eq(works.id, id)).get();
    expect(row?.currentChapterCount).toBe(3);
  });

  it('reports changed=false when there are no new chapters', async () => {
    const { id, url } = await createWork(2);
    staged.set(url, mangadexContent(2));
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await r(`/admin/refresh/${id}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RefreshBody;
    expect(body.ok).toBe(true);
    expect(body.changed).toBe(false);
    expect(body.currentChapterCount).toBe(2);
  });

  it('returns 409 when the polling lock is already held', async () => {
    const { id, url } = await createWork(2);
    staged.set(url, mangadexContent(3));
    db.update(works).set({ pollingLock: 1 }).where(eq(works.id, id)).run();
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await r(`/admin/refresh/${id}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as RefreshBody;
    expect(body.reason).toBe('locked');
  });

  it('returns 404 for an unknown work id', async () => {
    const cookie = await signIn(ADMIN_EMAIL);
    const res = await r('/admin/refresh/does-not-exist', { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it('returns 502 when the fetch pipeline throws', async () => {
    // No staged content for this work's URL → the mocked fetcher throws → checkWork returns 'error'.
    const { id } = await createWork(2);
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await r(`/admin/refresh/${id}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(502);
    const body = (await res.json()) as RefreshBody;
    expect(body.reason).toBe('error');
  });

  it('returns 422 when the work has no registered adapter', async () => {
    const ghostSiteId = nanoid();
    await db.insert(sites).values({
      id: ghostSiteId,
      name: `Ghost ${ghostSiteId}`,
      slug: `ghost-${ghostSiteId}`,
      fetcherStrategy: 'http',
      defaultPollIntervalMinutes: 10,
    });
    const workId = nanoid();
    await db.insert(works).values({
      id: workId,
      siteId: ghostSiteId,
      title: 'Ghost Work',
      chapterListUrl: 'https://example.com/ghost',
      currentChapterCount: 0,
      pollingLock: 0,
      createdAt: new Date(),
    });
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await r(`/admin/refresh/${workId}`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as RefreshBody;
    expect(body.reason).toBe('no_adapter');
  });
});

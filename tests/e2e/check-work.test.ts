import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { runMigrations } from '../../src/db/migrate.js';
import { seedSites } from '../../src/db/seed.js';
import { db } from '../../src/db/index.js';
import { sites, works } from '../../src/db/schema.js';

// Stage fetch content per URL without the live network (same pattern as admin-routes.test.ts):
// mock the fetcher module so checkWork's getFetcher returns staged content. A URL with no staged
// content makes the mocked fetcher throw, exercising the error path.
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

// checkWork is imported AFTER the mock is registered (vi.mock is hoisted, so this is safe).
const { checkWork } = await import('../../src/poller/check-work.js');

// Build a MangaDex aggregate JSON payload the mangadex adapter parses to exactly `n` chapters.
// n=0 produces an empty volume, which the adapter reports as `null` (a failed/empty extraction).
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

const getWork = (id: string) => db.select().from(works).where(eq(works.id, id)).get();

beforeAll(async () => {
  runMigrations();
  await seedSites();
  const site = await db.select().from(sites).where(eq(sites.slug, 'mangadex')).get();
  if (!site) throw new Error('mangadex site not seeded');
  mangadexSiteId = site.id;
});

beforeEach(() => {
  staged.clear();
});

describe('checkWork — refresh metadata', () => {
  it('records lastNewChapterAt and a success status when the count increases', async () => {
    const { id, url } = await createWork(2);
    staged.set(url, mangadexContent(5));

    const result = await checkWork(id);
    expect(result).toBe('updated');

    const row = await getWork(id);
    expect(row?.currentChapterCount).toBe(5);
    expect(row?.lastNewChapterAt).toBeInstanceOf(Date);
    expect(row?.lastCheckedAt).toBeInstanceOf(Date);
    expect(row?.lastRefreshStatus).toBe('success');
    expect(row?.lastRefreshErrorMessage).toBeNull();
  });

  it('records a success status but no new-chapter time when the count is unchanged', async () => {
    const { id, url } = await createWork(2);
    staged.set(url, mangadexContent(2));

    const result = await checkWork(id);
    expect(result).toBe('unchanged');

    const row = await getWork(id);
    expect(row?.lastCheckedAt).toBeInstanceOf(Date);
    expect(row?.lastRefreshStatus).toBe('success');
    expect(row?.lastRefreshErrorMessage).toBeNull();
    expect(row?.lastNewChapterAt).toBeNull();
  });

  it('records an error status when the fetch pipeline throws and does NOT stamp lastCheckedAt', async () => {
    const { id } = await createWork(2); // no staged content → fetcher throws

    const result = await checkWork(id);
    expect(result).toBe('error');

    const row = await getWork(id);
    expect(row?.lastRefreshStatus).toBe('error');
    expect(row?.lastRefreshErrorMessage).toBeTruthy();
    expect(row?.lastRefreshFailureAt).toBeInstanceOf(Date);
    // The bug fix: a failed refresh must NOT look like a successful check.
    expect(row?.lastCheckedAt).toBeNull();
    expect(row?.currentChapterCount).toBe(2);
  });

  it('treats a null extraction as an error and does NOT stamp lastCheckedAt', async () => {
    const { id, url } = await createWork(2);
    staged.set(url, mangadexContent(0)); // parses, but yields no chapters → adapter returns null

    const result = await checkWork(id);
    expect(result).toBe('error');

    const row = await getWork(id);
    expect(row?.lastRefreshStatus).toBe('error');
    expect(row?.lastRefreshErrorMessage).toBeTruthy();
    expect(row?.lastCheckedAt).toBeNull();
  });

  it('clears a prior error message on the next successful refresh', async () => {
    const { id, url } = await createWork(2);
    await db
      .update(works)
      .set({
        lastRefreshStatus: 'error',
        lastRefreshErrorMessage: 'previous failure',
        lastRefreshFailureAt: new Date(),
      })
      .where(eq(works.id, id));

    staged.set(url, mangadexContent(2));
    const result = await checkWork(id);
    expect(result).toBe('unchanged');

    const row = await getWork(id);
    expect(row?.lastRefreshStatus).toBe('success');
    expect(row?.lastRefreshErrorMessage).toBeNull();
  });
});

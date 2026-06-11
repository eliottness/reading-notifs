import { describe, it, expect } from 'vitest';
import type { InferSelectModel } from 'drizzle-orm';
import { DashboardPage } from '../../src/ui/pages/dashboard.js';
import type { works } from '../../src/db/schema.js';

type WorkWithSite = InferSelectModel<typeof works> & { siteName: string };

// A fully-populated, healthy tracked work. Overrides let each test tweak the refresh metadata.
function makeWork(overrides: Partial<WorkWithSite> = {}): WorkWithSite {
  return {
    id: 'w1',
    siteId: 's1',
    title: 'Test Work',
    chapterListUrl: 'https://mangadex.org/title/w1',
    currentChapterCount: 12,
    lastCheckedAt: new Date('2026-06-01T10:00:00Z'),
    lastNewChapterAt: null,
    lastRefreshStatus: 'success',
    lastRefreshErrorMessage: null,
    pollIntervalMinutes: null,
    pollingLock: 0,
    createdAt: new Date('2026-05-01T10:00:00Z'),
    siteName: 'MangaDex',
    ...overrides,
  };
}

const render = (trackedWorks: WorkWithSite[]): string =>
  String(DashboardPage({ user: { email: 'a@b.com' }, trackedWorks }));

describe('DashboardPage — refresh metadata', () => {
  it('surfaces the last-new-chapter time when present', () => {
    const html = render([makeWork({ lastNewChapterAt: new Date('2026-06-05T12:00:00Z') })]);
    expect(html).toContain('New chapter');
  });

  it('shows a failure badge and the error message when the last refresh errored', () => {
    const html = render([
      makeWork({
        lastRefreshStatus: 'error',
        lastRefreshErrorMessage: 'fetch timed out after 30s',
      }),
    ]);
    expect(html).toContain('Refresh failed');
    expect(html).toContain('fetch timed out after 30s');
  });

  it('does not show a failure badge for a healthy work', () => {
    const html = render([makeWork()]);
    expect(html).not.toContain('Refresh failed');
  });
});

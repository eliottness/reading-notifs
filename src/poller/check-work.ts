import { db } from '../db/index.js';
import { works, sites } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAdapterBySlug } from '../adapters/registry.js';
import { getFetcher } from '../fetchers/index.js';
import { dispatchNotifications } from '../notifications/dispatcher.js';
import { logger } from '../logger.js';

// Outcome of a single work check. The cron poller (src/poller/index.ts) ignores this value
// (fire-and-forget), but the synchronous admin refresh endpoint maps it to an HTTP status so the
// caller gets an honest result instead of an ambiguous "did anything happen?".
export type CheckWorkResult =
  | 'updated' // a higher chapter count was found and persisted (notifications dispatched)
  | 'unchanged' // checked successfully, no new chapters
  | 'locked' // another check (e.g. the cron poller) already holds the lock; no-op
  | 'not_found' // no work row with this id
  | 'no_adapter' // the work's site has no registered adapter (misconfiguration)
  | 'error'; // the fetch/extract pipeline threw (logged); count not updated

export async function checkWork(workId: string): Promise<CheckWorkResult> {
  const row = await db
    .select({ work: works, site: sites })
    .from(works)
    .innerJoin(sites, eq(works.siteId, sites.id))
    .where(eq(works.id, workId))
    .get();

  if (!row) return 'not_found';
  const { work, site } = row;

  const adapter = getAdapterBySlug(site.slug);
  if (!adapter) {
    logger.warn('poller_no_adapter', { work_id: workId, site_slug: site.slug });
    return 'no_adapter';
  }

  const lockResult = db
    .update(works)
    .set({ pollingLock: 1 })
    .where(and(eq(works.id, workId), eq(works.pollingLock, 0)))
    .run();
  if (lockResult.changes === 0) return 'locked';

  try {
    const fetcher = getFetcher(site.fetcherStrategy as 'http' | 'stealth');
    const content = await fetcher.fetch(work.chapterListUrl);
    const count = adapter.extractChapterCount(content);

    await db.update(works).set({ lastCheckedAt: new Date() }).where(eq(works.id, workId));

    if (count !== null && count > work.currentChapterCount) {
      await db.update(works).set({ currentChapterCount: count }).where(eq(works.id, workId));
      logger.info('new_chapter', {
        work_id: workId,
        title: work.title,
        from: work.currentChapterCount,
        to: count,
      });
      await dispatchNotifications(workId, work.title, count);
      return 'updated';
    }
    return 'unchanged';
  } catch (err) {
    logger.error('poller_check_failed', {
      work_id: workId,
      title: work.title,
      url: work.chapterListUrl,
      fetcher: site.fetcherStrategy,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return 'error';
  } finally {
    await db.update(works).set({ pollingLock: 0 }).where(eq(works.id, workId));
  }
}

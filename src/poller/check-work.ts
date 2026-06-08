import { db } from '../db/index.js';
import { works, sites } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAdapterBySlug } from '../adapters/registry.js';
import { getFetcher } from '../fetchers/index.js';
import { dispatchNotifications } from '../notifications/dispatcher.js';
import { logger } from '../logger.js';

export async function checkWork(workId: string): Promise<void> {
  const row = await db
    .select({ work: works, site: sites })
    .from(works)
    .innerJoin(sites, eq(works.siteId, sites.id))
    .where(eq(works.id, workId))
    .get();

  if (!row) return;
  const { work, site } = row;

  const adapter = getAdapterBySlug(site.slug);
  if (!adapter) {
    logger.warn('poller_no_adapter', { work_id: workId, site_slug: site.slug });
    return;
  }

  const lockResult = db
    .update(works)
    .set({ pollingLock: 1 })
    .where(and(eq(works.id, workId), eq(works.pollingLock, 0)))
    .run();
  if (lockResult.changes === 0) return;

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
    }
  } catch (err) {
    logger.error('poller_check_failed', {
      work_id: workId,
      title: work.title,
      url: work.chapterListUrl,
      fetcher: site.fetcherStrategy,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  } finally {
    await db.update(works).set({ pollingLock: 0 }).where(eq(works.id, workId));
  }
}

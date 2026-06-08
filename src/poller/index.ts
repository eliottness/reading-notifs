import cron from 'node-cron';
import { db } from '../db/index.js';
import { works } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { checkWork } from './check-work.js';
import { logger } from '../logger.js';

export function startPoller(): void {
  db.update(works).set({ pollingLock: 0 }).run();

  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const allWorks = await db.select().from(works).where(eq(works.pollingLock, 0));

    for (const work of allWorks) {
      const intervalMs = (work.pollIntervalMinutes ?? 10) * 60 * 1000;
      const lastChecked = work.lastCheckedAt?.getTime() ?? 0;
      if (now.getTime() - lastChecked >= intervalMs) {
        checkWork(work.id).catch((err) =>
          logger.error('poller_unexpected_error', {
            work_id: work.id,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          }),
        );
      }
    }
  });

  logger.info('poller_started', { schedule: '* * * * *' });
}

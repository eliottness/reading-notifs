import { db } from '../db/index.js';
import { notificationChannels, notificationLog, subscriptions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getProvider } from './registry.js';
import { nanoid } from 'nanoid';

export async function dispatchNotifications(
  workId: string,
  workTitle: string,
  newChapterCount: number,
) {
  const subs = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.workId, workId));

  const userIds = [...new Set(subs.map((s) => s.userId))];

  for (const userId of userIds) {
    const channels = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.userId, userId));

    for (const channel of channels) {
      if (!channel.enabled) continue;
      const provider = getProvider(channel.type);
      if (!provider) continue;

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(channel.config) as Record<string, unknown>;
      } catch {
        continue;
      }

      const result = await provider.send({ channelConfig: config, workTitle, newChapterCount });

      await db.insert(notificationLog).values({
        id: nanoid(),
        channelId: channel.id,
        workId,
        chapterCount: newChapterCount,
        sentAt: new Date(),
        status: result.success ? 'sent' : 'failed',
        error: result.error ?? null,
      });
    }
  }
}

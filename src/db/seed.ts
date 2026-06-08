import { db } from './index.js';
import { sites } from './schema.js';
import { getAllAdapters } from '../adapters/registry.js';
import { nanoid } from 'nanoid';

export async function seedSites() {
  const adapters = getAllAdapters();
  for (const adapter of adapters) {
    await db
      .insert(sites)
      .values({
        id: nanoid(),
        name: adapter.name,
        slug: adapter.slug,
        fetcherStrategy: adapter.fetcherStrategy,
        defaultPollIntervalMinutes: adapter.defaultPollIntervalMinutes,
      })
      .onConflictDoNothing();
  }
}

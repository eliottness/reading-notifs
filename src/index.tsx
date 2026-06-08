import { serve } from '@hono/node-server';
import app from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedSites } from './db/seed.js';
import { startPoller } from './poller/index.js';
import { logger } from './logger.js';

const port = Number(process.env.PORT ?? 3000);

Promise.resolve()
  .then(() => runMigrations())
  .then(() => seedSites())
  .then(() => {
    startPoller();
    serve({ fetch: app.fetch, port }, () => {
      logger.info('server_started', { port });
    });
  })
  .catch((err) => {
    logger.error('startup_failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });

export default app;

import { serve } from '@hono/node-server';
import app from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedSites } from './db/seed.js';
import { startPoller } from './poller/index.js';
import { getAdminEmails } from './auth/admin.js';
import { logger } from './logger.js';

const port = Number(process.env.PORT ?? 3000);

Promise.resolve()
  .then(() => runMigrations())
  .then(() => seedSites())
  .then(() => {
    // Non-fatal: the app runs fine without admins, but the /admin/* endpoints are then inaccessible.
    if (getAdminEmails().size === 0) {
      logger.warn('no_admins_configured', {
        hint: 'Set ADMIN_EMAILS (comma-separated) to enable the /admin/* endpoints.',
      });
    }
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

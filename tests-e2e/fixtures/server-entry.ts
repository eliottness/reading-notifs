// E2E web server entrypoint (launched by playwright.config.ts `webServer`). Mirrors the real
// bootstrap in src/index.tsx (migrate → seed → serve) but:
//   - runs an in-process mock SMTP so the real magic-link email flow can be asserted across the
//     process boundary via GET /__test__/emails;
//   - skips startPoller() so only programmatic /__test__/check triggers run (no wall-clock cron).
import { serve } from '@hono/node-server';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMockSmtp } from '../../tests/helpers/mock-smtp.js';
import { setEmailsRef } from '../../src/test-support/state.js';

const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 2526);

async function main() {
  // Start from a clean file-based DB each server boot. The directory must exist before db/index.ts
  // opens the connection (which happens at import time, transitively via app).
  const dbPath = process.env.DATABASE_URL ?? './.tmp/e2e.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  for (const ext of ['', '-wal', '-shm']) {
    rmSync(`${dbPath}${ext}`, { force: true });
  }

  // Stand up the mock SMTP before importing app/auth so the email transporter targets it.
  const smtp = await createMockSmtp(SMTP_PORT);
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_FROM = 'noreply@reading-notifs.test';
  setEmailsRef(smtp.emails);

  const [{ default: app }, { runMigrations }, { seedSites }, { logger }] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/db/migrate.js'),
    import('../../src/db/seed.js'),
    import('../../src/logger.js'),
  ]);

  runMigrations();
  await seedSites();

  // Intentionally NOT calling startPoller(): tests drive checks via POST /__test__/check/:id.
  const port = Number(process.env.PORT ?? 3100);
  serve({ fetch: app.fetch, port }, () => {
    logger.info('e2e_server_started', { port, smtp_port: smtp.port });
  });
}

main().catch((err) => {
  console.error('e2e server-entry failed:', err);
  process.exit(1);
});

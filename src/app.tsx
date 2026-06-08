import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { auth } from './auth/index.js';
import { requireAuth } from './auth/middleware.js';
import { logger } from './logger.js';
import { db } from './db/index.js';
import { works, sites, subscriptions, notificationChannels } from './db/schema.js';
import { getAdapterForUrl } from './adapters/registry.js';
import { getFetcher } from './fetchers/index.js';
import { LoginPage, LoginFormPartial } from './ui/pages/login.js';
import { DashboardPage } from './ui/pages/dashboard.js';
import { AddWorkPage } from './ui/pages/add-work.js';
import { NotificationsPage } from './ui/pages/notifications.js';

type Variables = {
  user: { id: string; email: string; name: string };
  session: { id: string };
};

function isAllowedFetchUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const h = parsed.hostname;
  return !(
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '[::1]' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '169.254.169.254'
  );
}

function isDiscordWebhookUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return (
      p.protocol === 'https:' &&
      (p.hostname === 'discord.com' || p.hostname === 'discordapp.com') &&
      p.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

const app = new Hono<{ Variables: Variables }>();

// Request logger
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  logger.info('request', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: Date.now() - start,
  });
});

// Static assets: dev serves from src/public; the production build copies them to dist/public
const publicDir = process.env.NODE_ENV === 'production' ? './dist/public' : './src/public';
app.use('/sw.js', serveStatic({ path: `${publicDir}/sw.js` }));
app.use('/push.js', serveStatic({ path: `${publicDir}/push.js` }));

app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw));

app.get('/', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session ? c.redirect('/dashboard') : c.redirect('/login');
});

app.get('/login', (c) => c.html(<LoginPage />));

app.post('/auth/send-magic-link', async (c) => {
  const isHtmx = c.req.header('HX-Request') === 'true';
  const partial = (props: { message: string; isError?: boolean }, status?: ContentfulStatusCode) =>
    isHtmx
      ? c.html(<LoginFormPartial {...props} />, status)
      : c.html(<LoginPage {...props} />, status);

  const body = await c.req.parseBody();
  const email = String(body.email ?? '');
  if (!email) return partial({ message: 'Please provide an email address.', isError: true }, 400);

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/dashboard' },
      headers: c.req.raw.headers,
    });
    logger.info('magic_link_sent', { email_domain: email.split('@')[1] });
    return partial({ message: `Check your email (${email}) for a login link.` });
  } catch (err) {
    logger.error('magic_link_failed', {
      email_domain: email.split('@')[1],
      smtp_host: process.env.SMTP_HOST ?? 'localhost',
      smtp_port: process.env.SMTP_PORT ?? '1025',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const message = err instanceof Error ? err.message : String(err);
    return partial({ message, isError: true }, 500);
  }
});

app.use('/dashboard', requireAuth);
app.use('/add-work', requireAuth);
app.use('/works/*', requireAuth);
app.use('/notifications', requireAuth);
app.use('/notifications/*', requireAuth);
app.use('/push/*', requireAuth);

app.get('/dashboard', async (c) => {
  const user = c.get('user');
  const rows = await db
    .select({ work: works, siteName: sites.name })
    .from(subscriptions)
    .innerJoin(works, eq(subscriptions.workId, works.id))
    .innerJoin(sites, eq(works.siteId, sites.id))
    .where(eq(subscriptions.userId, user.id));

  return c.html(
    <DashboardPage
      user={user}
      trackedWorks={rows.map((r) => ({ ...r.work, siteName: r.siteName }))}
    />,
  );
});

app.get('/add-work', async (c) => {
  const user = c.get('user');
  const allSites = await db.select().from(sites);
  return c.html(<AddWorkPage user={user} availableSites={allSites} />);
});

app.post('/works', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const siteId = String(body.siteId ?? '');
  const title = String(body.title ?? '').trim();
  const chapterListUrl = String(body.chapterListUrl ?? '').trim();

  if (!siteId || !title || !chapterListUrl) {
    const allSites = await db.select().from(sites);
    return c.html(
      <AddWorkPage user={user} availableSites={allSites} error="All fields are required." />,
      422,
    );
  }

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    const allSites = await db.select().from(sites);
    return c.html(<AddWorkPage user={user} availableSites={allSites} error="Invalid site." />, 422);
  }

  if (!isAllowedFetchUrl(chapterListUrl)) {
    const allSites = await db.select().from(sites);
    return c.html(
      <AddWorkPage
        user={user}
        availableSites={allSites}
        error="Invalid URL: must be a public HTTPS/HTTP address."
      />,
      422,
    );
  }

  const adapter = getAdapterForUrl(chapterListUrl);
  if (!adapter) {
    const allSites = await db.select().from(sites);
    return c.html(
      <AddWorkPage
        user={user}
        availableSites={allSites}
        error="URL doesn't match any supported site."
      />,
      422,
    );
  }

  const workId = nanoid();

  let initialCount = 0;
  try {
    const fetcher = getFetcher(site.fetcherStrategy as 'http' | 'stealth');
    const content = await fetcher.fetch(chapterListUrl);
    initialCount = adapter.extractChapterCount(content) ?? 0;
  } catch {
    // Don't fail registration if initial fetch errors; poller will retry
  }

  await db.insert(works).values({
    id: workId,
    siteId,
    title,
    chapterListUrl,
    currentChapterCount: initialCount,
    createdAt: new Date(),
  });

  await db.insert(subscriptions).values({
    id: nanoid(),
    userId: user.id,
    workId,
    createdAt: new Date(),
  });

  return c.redirect('/dashboard');
});

app.delete('/works/:id', async (c) => {
  const user = c.get('user');
  const workId = c.req.param('id');

  await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.workId, workId)));

  const remaining = await db.select().from(subscriptions).where(eq(subscriptions.workId, workId));
  if (remaining.length === 0) {
    await db.delete(works).where(eq(works.id, workId));
  }

  return c.body(null, 204);
});

app.get('/notifications', async (c) => {
  const user = c.get('user');
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.userId, user.id));
  return c.html(
    <NotificationsPage
      user={user}
      channels={channels}
      vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''}
    />,
  );
});

app.post('/notifications', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const type = String(body.type ?? '') as 'email' | 'push' | 'discord';

  let config: Record<string, unknown> = {};
  if (type === 'email') {
    config = { address: user.email };
  } else if (type === 'discord') {
    const webhookUrl = String(body.webhookUrl ?? '');
    if (!isDiscordWebhookUrl(webhookUrl)) {
      return c.redirect('/notifications');
    }
    config = { webhookUrl };
  } else {
    return c.redirect('/notifications');
  }

  await db
    .insert(notificationChannels)
    .values({
      id: nanoid(),
      userId: user.id,
      type,
      config: JSON.stringify(config),
      enabled: true,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return c.redirect('/notifications');
});

app.delete('/notifications/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await db
    .delete(notificationChannels)
    .where(and(eq(notificationChannels.id, id), eq(notificationChannels.userId, user.id)));
  return c.redirect('/notifications');
});

app.post('/push/subscribe', async (c) => {
  const user = c.get('user');
  const sub = await c.req.json<Record<string, unknown>>();

  await db
    .insert(notificationChannels)
    .values({
      id: nanoid(),
      userId: user.id,
      type: 'push',
      config: JSON.stringify(sub),
      enabled: true,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return c.json({ ok: true });
});

export default app;

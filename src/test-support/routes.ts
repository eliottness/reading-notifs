// TEST_MODE-only HTTP surface. Mounted at /__test__ in src/app.tsx ONLY when process.env.TEST_MODE
// is truthy, and never imported elsewhere by production code paths. Provides fast auth, fetcher
// staging, a programmatic poll trigger, push-subscription staging, email inspection, and a reset.
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { auth } from '../auth/index.js';
import { db } from '../db/index.js';
import {
  user,
  session,
  account,
  verification,
  works,
  subscriptions,
  notificationChannels,
  notificationLog,
} from '../db/schema.js';
import { __setTestFetchOverride } from '../fetchers/index.js';
import { checkWork } from '../poller/check-work.js';
import { stagedFetches, takeMagicLink, getEmails } from './state.js';

// Register the override once; it reads the live stagedFetches map on every call.
__setTestFetchOverride((url) => stagedFetches.get(url));

export const testRouter = new Hono();

async function findUserId(email: string): Promise<string | undefined> {
  const row = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .get();
  return row?.id;
}

// Mint a real better-auth session for `email` and relay the signed Set-Cookie to the browser.
testRouter.post('/login', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email) return c.json({ error: 'email required' }, 400);

  // Triggers token generation + sendMagicLink, which (in TEST_MODE) records the verify URL BEFORE
  // it sends the email. A transient SMTP failure must not break test login, so swallow the error
  // here and rely on the recorded URL below — if recording happened, the session can still be minted.
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/dashboard' },
      headers: c.req.raw.headers,
    });
  } catch {
    // ignored: the verify URL is recorded pre-send; absence is handled just below.
  }

  const verifyUrl = takeMagicLink(email);
  if (!verifyUrl) return c.json({ error: 'no magic link recorded' }, 500);

  // Replay the verify URL through the real auth handler to obtain a genuine session cookie.
  const verifyRes = await auth.handler(new Request(verifyUrl, { redirect: 'manual' }));
  const setCookie = verifyRes.headers.get('set-cookie');
  if (!setCookie) return c.json({ error: 'no session cookie issued' }, 500);

  c.header('set-cookie', setCookie);
  return c.json({ ok: true });
});

// Stage (or restage) content returned by the fetcher override for an exact URL.
testRouter.post('/fetcher-mock', async (c) => {
  const { url, content } = await c.req.json<{ url: string; content: string }>();
  if (!url) return c.json({ error: 'url required' }, 400);
  stagedFetches.set(url, content);
  return c.json({ ok: true });
});

// Run the real checkWork pipeline (fetch → extract → dispatch → providers) for one work.
testRouter.post('/check/:workId', async (c) => {
  await checkWork(c.req.param('workId'));
  return c.json({ ok: true });
});

// Stage a test-owned push subscription (mock endpoint + test-held keys) so dispatch encrypts a real
// web-push message the mock service can decrypt. Stored exactly like POST /push/subscribe.
testRouter.post('/push-subscribe', async (c) => {
  const { email, subscription } = await c.req.json<{
    email: string;
    subscription: Record<string, unknown>;
  }>();
  const userId = await findUserId(email);
  if (!userId) return c.json({ error: 'unknown user' }, 404);

  await db
    .insert(notificationChannels)
    .values({
      id: nanoid(),
      userId,
      type: 'push',
      config: JSON.stringify(subscription),
      enabled: true,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

// Subscribe an existing user to an existing work (so multiple users can share one work, exercising
// the dispatcher's per-user fan-out which the UI's create-per-add flow can't set up directly).
testRouter.post('/subscribe-work', async (c) => {
  const { email, workId } = await c.req.json<{ email: string; workId: string }>();
  const userId = await findUserId(email);
  if (!userId) return c.json({ error: 'unknown user' }, 404);
  await db
    .insert(subscriptions)
    .values({ id: nanoid(), userId, workId, createdAt: new Date() })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

// Stage an arbitrary notification channel for a user, bypassing UI validation. Used to point a
// Discord channel at a local mock webhook (the UI's isDiscordWebhookUrl guard forbids localhost),
// keeping dispatch fully off the live network.
testRouter.post('/channel', async (c) => {
  const { email, type, config } = await c.req.json<{
    email: string;
    type: 'email' | 'push' | 'discord';
    config: Record<string, unknown>;
  }>();
  const userId = await findUserId(email);
  if (!userId) return c.json({ error: 'unknown user' }, 404);
  await db
    .insert(notificationChannels)
    .values({
      id: nanoid(),
      userId,
      type,
      config: JSON.stringify(config),
      enabled: true,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

// List a user's tracked work ids (for staging fetcher mocks / triggering checks).
testRouter.get('/works', async (c) => {
  const email = c.req.query('email') ?? '';
  const userId = await findUserId(email);
  if (!userId) return c.json({ works: [] });
  const rows = await db
    .select({ id: works.id, title: works.title, chapterListUrl: works.chapterListUrl })
    .from(subscriptions)
    .innerJoin(works, eq(subscriptions.workId, works.id))
    .where(eq(subscriptions.userId, userId));
  return c.json({ works: rows });
});

// Captured emails (from the in-process mock SMTP) for asserting the real magic-link flow.
testRouter.get('/emails', (c) => {
  const email = c.req.query('email');
  const all = getEmails();
  const filtered = email ? all.filter((e) => e.to.includes(email)) : all;
  return c.json({ emails: filtered });
});

// Truncate per-test app + auth data, keeping seeded sites. Children deleted before parents.
testRouter.post('/reset', async (c) => {
  await db.delete(notificationLog).run();
  await db.delete(notificationChannels).run();
  await db.delete(subscriptions).run();
  await db.delete(works).run();
  await db.delete(session).run();
  await db.delete(account).run();
  await db.delete(verification).run();
  await db.delete(user).run();
  stagedFetches.clear();
  return c.json({ ok: true });
});

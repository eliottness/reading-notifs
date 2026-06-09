import {
  test,
  expect,
  login,
  addWork,
  registerSw,
  enablePushUI,
  stageFetcher,
  stagePushSub,
  stageChannel,
  triggerCheck,
  subscribeWork,
  listWorks,
  getEmails,
  mangadexAggregate,
  waitForNotifications,
  type DecryptedPush,
} from '../fixtures/test-base.js';
import { relayPush, relayMode } from '../fixtures/push-relay.js';
import { createMockPushService, type MockPushService } from '../fixtures/mock-push-service.js';
import type { Page } from '@playwright/test';

// Must match the webServer origin (playwright.config.ts uses the same E2E_PORT default) so the CDP
// relay matches the service worker's scopeURL.
const ORIGIN = `http://localhost:${Number(process.env.E2E_PORT ?? 3100)}`;
const BODY = 'New chapter available!';
const md = (slug: string) => `https://mangadex.org/title/${slug}`;

// Log in, stage a baseline chapter count, add the work, register the real SW, and stage a
// decryptable test-owned push subscription. Returns the new work id.
async function primeWork(
  page: Page,
  mock: MockPushService,
  opts: { email: string; title: string; url: string; baseline?: number },
): Promise<string> {
  await login(page, opts.email);
  await stageFetcher(page, opts.url, mangadexAggregate(opts.baseline ?? 5));
  await addWork(page, { title: opts.title, url: opts.url });
  await registerSw(page);
  await stagePushSub(page, opts.email, { endpoint: mock.endpoint, keys: mock.keys });
  const works = await listWorks(page, opts.email);
  const work = works.find((w) => w.chapterListUrl === opts.url);
  expect(work, 'work should exist after add').toBeTruthy();
  return work!.id;
}

test('enabling push registers the real SW and stores the subscription', async ({ page }) => {
  await login(page, 'pd-register@example.com');
  const status = await enablePushUI(page);
  expect(status).toBe(200);
  await expect(page.getByRole('button', { name: 'Disable push notifications' })).toBeVisible();
  const hasReg = await page.evaluate(
    async () => !!(await navigator.serviceWorker.getRegistration()),
  );
  expect(hasReg).toBe(true);
});

test('new chapter fires SW showNotification via real encrypted web-push', async ({
  page,
  mockPush,
}) => {
  const url = md('pd-fire');
  const workId = await primeWork(page, mockPush, {
    email: 'pd-fire@example.com',
    title: 'Vinland Saga',
    url,
  });

  await stageFetcher(page, url, mangadexAggregate(12));
  await triggerCheck(page, workId);

  const decrypted = await mockPush.waitForPush();
  await relayPush(page, decrypted, ORIGIN);

  const notifs = await waitForNotifications(page, 1);
  expect(notifs[0].title).toBe('Vinland Saga');
  expect(notifs[0].body).toBe(BODY);
  console.log(`[push-delivery] relay mode=${relayMode()}`);
});

test('decrypted payload matches the work title and standard body', async ({ page, mockPush }) => {
  const url = md('pd-payload');
  const workId = await primeWork(page, mockPush, {
    email: 'pd-payload@example.com',
    title: 'Chainsaw Man',
    url,
  });

  await stageFetcher(page, url, mangadexAggregate(99));
  await triggerCheck(page, workId);

  const decrypted = await mockPush.waitForPush();
  // The decrypted (real-encryption) payload itself proves the title/body crossed the wire.
  expect(decrypted).toEqual<DecryptedPush>({ title: 'Chainsaw Man', body: BODY });

  await relayPush(page, decrypted, ORIGIN);
  const notifs = await waitForNotifications(page, 1);
  expect(notifs[0]).toEqual({ title: 'Chainsaw Man', body: BODY });
});

test('multiple tracked works each fire their own titled notification', async ({
  page,
  mockPush,
}) => {
  const email = 'pd-multi@example.com';
  const urlA = md('pd-multi-a');
  const urlB = md('pd-multi-b');

  await login(page, email);
  await stageFetcher(page, urlA, mangadexAggregate(5));
  await addWork(page, { title: 'Alpha', url: urlA });
  await stageFetcher(page, urlB, mangadexAggregate(5));
  await addWork(page, { title: 'Beta', url: urlB });
  await registerSw(page);
  await stagePushSub(page, email, { endpoint: mockPush.endpoint, keys: mockPush.keys });

  const works = await listWorks(page, email);
  const idA = works.find((w) => w.chapterListUrl === urlA)!.id;
  const idB = works.find((w) => w.chapterListUrl === urlB)!.id;

  await stageFetcher(page, urlA, mangadexAggregate(10));
  await triggerCheck(page, idA);
  const [first] = await mockPush.waitForCount(1);
  await relayPush(page, first, ORIGIN);

  await stageFetcher(page, urlB, mangadexAggregate(10));
  await triggerCheck(page, idB);
  const received = await mockPush.waitForCount(2);
  await relayPush(page, received[1], ORIGIN);

  const notifs = await waitForNotifications(page, 2);
  const titles = notifs.map((n) => n.title).sort();
  expect(titles).toEqual(['Alpha', 'Beta']);
});

test('two subscribed users each receive their own notification (fan-out)', async ({
  page,
  browser,
  mockPush,
}) => {
  const emailA = 'pd-fanA@example.com';
  const emailB = 'pd-fanB@example.com';
  const url = md('pd-fanout');

  // User A owns the work and subscribes a push channel.
  const workId = await primeWork(page, mockPush, { email: emailA, title: 'Shared Work', url });

  // User B (separate context + own SW + own mock) is subscribed to the SAME work.
  const mockPushB = await createMockPushService();
  const ctxB = await browser.newContext({ permissions: ['notifications'] });
  const pageB = await ctxB.newPage();
  await pageB.addInitScript(() => {
    (window as unknown as { __notifications: unknown[] }).__notifications = [];
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as { __notif?: boolean; title?: string; body?: string };
      if (d && d.__notif)
        (window as unknown as { __notifications: unknown[] }).__notifications.push({
          title: d.title,
          body: d.body,
        });
    });
  });
  try {
    await login(pageB, emailB);
    await registerSw(pageB);
    await subscribeWork(pageB, emailB, workId);
    await stagePushSub(pageB, emailB, { endpoint: mockPushB.endpoint, keys: mockPushB.keys });

    await stageFetcher(page, url, mangadexAggregate(20));
    await triggerCheck(page, workId);

    const dA = await mockPush.waitForPush();
    const dB = await mockPushB.waitForPush();
    expect(dA).toEqual({ title: 'Shared Work', body: BODY });
    expect(dB).toEqual({ title: 'Shared Work', body: BODY });

    await relayPush(page, dA, ORIGIN);
    await relayPush(pageB, dB, ORIGIN);

    const notifsA = await waitForNotifications(page, 1);
    const notifsB = await waitForNotifications(pageB, 1);
    expect(notifsA[0].title).toBe('Shared Work');
    expect(notifsB[0].title).toBe('Shared Work');
  } finally {
    await ctxB.close();
    await mockPushB.close();
  }
});

test('unsubscribing (disable push) stops future notifications', async ({ page, mockPush }) => {
  const url = md('pd-unsub');
  const workId = await primeWork(page, mockPush, {
    email: 'pd-unsub@example.com',
    title: 'Gone',
    url,
  });

  // Remove the push channel (hx-delete re-renders in place).
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Disable push notifications' }).click();
  await expect(page.getByRole('button', { name: 'Disable push notifications' })).toHaveCount(0);

  await stageFetcher(page, url, mangadexAggregate(30));
  await triggerCheck(page, workId);

  // No enabled push channel → no web-push sent.
  await page.waitForTimeout(500);
  expect(mockPush.received).toHaveLength(0);
});

test('push still delivers when email and discord channels are also enabled', async ({
  page,
  mockPush,
  mockDiscord,
}) => {
  const email = 'pd-multichan@example.com';
  const url = md('pd-multichan');
  const workId = await primeWork(page, mockPush, { email, title: 'Multi Channel', url });

  // Email via the real UI (mock SMTP), Discord via a staged channel pointing at the local mock
  // (the UI guard forbids non-discord.com hosts, so we stage it directly to avoid live network).
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Enable email notifications' }).click();
  await expect(page.getByRole('button', { name: 'Disable email notifications' })).toBeVisible();
  await stageChannel(page, email, 'discord', { webhookUrl: mockDiscord.url });

  await stageFetcher(page, url, mangadexAggregate(42));
  await triggerCheck(page, workId);

  const decrypted = await mockPush.waitForPush();
  await relayPush(page, decrypted, ORIGIN);
  const notifs = await waitForNotifications(page, 1);
  expect(notifs[0].title).toBe('Multi Channel');

  // The other channels also fired locally (no live network).
  expect(mockDiscord.requests.length).toBeGreaterThan(0);
  const emails = await getEmails(page, email);
  expect(emails.length).toBeGreaterThan(0);
});

test('no chapter-count change fires no notification', async ({ page, mockPush }) => {
  const url = md('pd-nochange');
  const workId = await primeWork(page, mockPush, {
    email: 'pd-nochange@example.com',
    title: 'Static',
    url,
    baseline: 8,
  });

  // Same count (8) → checkWork does not dispatch.
  await stageFetcher(page, url, mangadexAggregate(8));
  await triggerCheck(page, workId);

  await page.waitForTimeout(500);
  expect(mockPush.received).toHaveLength(0);
});

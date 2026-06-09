// Shared Playwright fixtures + helpers for the e2e suite. Extends the base `test` with:
//   - a `page` that records SW-posted notifications into window.__notifications;
//   - an auto `reset` that truncates per-test app/auth data via /__test__/reset;
//   - a `mockPush` fixture (test-owned push endpoint + decrypt).
// Helpers wrap the TEST_MODE routes and the real UI flows the specs drive.
import { test as base, expect, type Page } from '@playwright/test';
import {
  createMockPushService,
  type MockPushService,
  type DecryptedPush,
} from './mock-push-service.js';
import { createMockDiscordWebhook } from '../../tests/helpers/mock-discord.js';

type MockDiscord = Awaited<ReturnType<typeof createMockDiscordWebhook>>;

type Fixtures = {
  mockPush: MockPushService;
  mockDiscord: MockDiscord;
  resetDb: void;
};

export const test = base.extend<Fixtures>({
  // Auto fixture: truncate per-test app/auth data before every test (keeps seeded sites). Declared
  // as a fixture (not test.beforeEach) so it applies to every spec that imports this `test`, and
  // runs before each spec's own beforeEach (e.g. login). Depends on `page` for the shared baseURL.
  resetDb: [
    async ({ page }, use) => {
      const res = await page.request.post('/__test__/reset');
      expect(res.ok()).toBeTruthy();
      await use();
    },
    { auto: true },
  ],

  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__notifications = [];
      navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
        const d = e.data as { __notif?: boolean; title?: string; body?: string };
        if (d && d.__notif) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__notifications.push({ title: d.title, body: d.body });
        }
      });
    });
    await use(page);
  },

  // Auto-reset before each test for isolation; depends on `page` so baseURL is available.
  // eslint-disable-next-line no-empty-pattern
  mockPush: async ({}, use) => {
    const svc = await createMockPushService();
    await use(svc);
    await svc.close();
  },

  // eslint-disable-next-line no-empty-pattern
  mockDiscord: async ({}, use) => {
    const svc = await createMockDiscordWebhook();
    await use(svc);
    await svc.close();
  },
});

export { expect };
export type { DecryptedPush };

// ── TEST_MODE route helpers ───────────────────────────────────────────────

/** Mint a real better-auth session for `email`; the Set-Cookie is stored in the page context. */
export async function login(page: Page, email: string): Promise<void> {
  const res = await page.request.post('/__test__/login', { data: { email } });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
}

export async function stageFetcher(page: Page, url: string, content: string): Promise<void> {
  const res = await page.request.post('/__test__/fetcher-mock', { data: { url, content } });
  expect(res.ok()).toBeTruthy();
}

export async function triggerCheck(page: Page, workId: string): Promise<void> {
  const res = await page.request.post(`/__test__/check/${workId}`);
  expect(res.ok()).toBeTruthy();
}

export async function stagePushSub(
  page: Page,
  email: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const res = await page.request.post('/__test__/push-subscribe', {
    data: { email, subscription: { ...subscription, expirationTime: null } },
  });
  expect(res.ok()).toBeTruthy();
}

export async function subscribeWork(page: Page, email: string, workId: string): Promise<void> {
  const res = await page.request.post('/__test__/subscribe-work', { data: { email, workId } });
  expect(res.ok()).toBeTruthy();
}

export async function stageChannel(
  page: Page,
  email: string,
  type: 'email' | 'push' | 'discord',
  config: Record<string, unknown>,
): Promise<void> {
  const res = await page.request.post('/__test__/channel', { data: { email, type, config } });
  expect(res.ok()).toBeTruthy();
}

export async function listWorks(
  page: Page,
  email: string,
): Promise<{ id: string; title: string; chapterListUrl: string }[]> {
  const res = await page.request.get(`/__test__/works?email=${encodeURIComponent(email)}`);
  const json = (await res.json()) as {
    works: { id: string; title: string; chapterListUrl: string }[];
  };
  return json.works;
}

export async function getEmails(page: Page, email: string): Promise<{ body: string }[]> {
  const res = await page.request.get(`/__test__/emails?email=${encodeURIComponent(email)}`);
  const json = (await res.json()) as { emails: { body: string }[] };
  return json.emails;
}

// ── MangaDex content + UI helpers ─────────────────────────────────────────

/** Build a MangaDex /aggregate JSON response yielding exactly `count` chapters. */
export function mangadexAggregate(count: number): string {
  const chapters: Record<string, unknown> = {};
  for (let i = 1; i <= count; i++) chapters[String(i)] = { chapter: String(i), id: `ch-${i}` };
  return JSON.stringify({ result: 'ok', volumes: { '1': { volume: '1', chapters } } });
}

/** Add a work via the real /add-work UI; returns once redirected to the dashboard. */
export async function addWork(
  page: Page,
  opts: { title: string; url: string; site?: string },
): Promise<void> {
  await page.goto('/add-work');
  await page.selectOption('#siteId', { label: opts.site ?? 'MangaDex' });
  await page.fill('#title', opts.title);
  await page.fill('#chapterListUrl', opts.url);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
}

/** Register the instrumented SW and wait until it is active (no pushManager dependency). */
export async function registerSw(page: Page): Promise<void> {
  await page.goto('/notifications');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
}

/**
 * Drive the real #enable-push UI click and wait for the POST /push/subscribe round-trip.
 *
 * Headless Chromium has no real push service, so PushManager.subscribe always rejects. We stub ONLY
 * that one unavailable browser primitive; everything else stays real: the button click, the SW
 * registration, Notification.requestPermission (auto-granted via context permissions), the
 * sub.toJSON() POST to /push/subscribe, and the server-side persistence. Returns the POST status.
 */
export async function enablePushUI(page: Page): Promise<number> {
  await page.addInitScript(() => {
    const fake = {
      endpoint: 'https://stub.push.local/' + Math.random().toString(36).slice(2),
      expirationTime: null,
      getKey: () => null,
      unsubscribe: () => Promise.resolve(true),
      toJSON: () => ({
        endpoint: fake.endpoint,
        expirationTime: null,
        keys: { p256dh: 'stub-p256dh-ui-test-only', auth: 'stub-auth' },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PushManager.prototype as any).subscribe = () => Promise.resolve(fake);
  });
  await page.goto('/notifications');
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/push/subscribe') && r.request().method() === 'POST',
      { timeout: 15_000 },
    ),
    page.click('#enable-push'),
  ]);
  return resp.status();
}

/** Wait until at least `min` SW notifications have been recorded, then return them. */
export async function waitForNotifications(
  page: Page,
  min = 1,
  timeout = 6000,
): Promise<DecryptedPush[]> {
  await page.waitForFunction(
    (n) => (window as unknown as { __notifications: unknown[] }).__notifications.length >= n,
    min,
    { timeout },
  );
  return page.evaluate(
    () => (window as unknown as { __notifications: DecryptedPush[] }).__notifications,
  );
}

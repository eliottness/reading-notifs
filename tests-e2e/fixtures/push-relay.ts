// Gets a decrypted push payload into the real Service Worker so its push handler fires
// showNotification (captured by the instrumented SW). Two interchangeable mechanisms share the same
// decrypt hop and the same assertion; select via PUSH_RELAY (default 'cdp').
//
//   cdp    — Chrome DevTools Protocol ServiceWorker.deliverPushMessage. Highest fidelity: Chromium
//            dispatches a genuine push event into the worker. (Note: the method lives in the
//            ServiceWorker domain, not a "Push" domain.)
//   inject — postMessage the payload to the active worker, which re-runs showNotification. CI-stable
//            fallback that synthesizes the dispatch.
import type { Page } from '@playwright/test';
import type { DecryptedPush } from './mock-push-service.js';

export type RelayMode = 'cdp' | 'inject';

export function relayMode(): RelayMode {
  return process.env.PUSH_RELAY === 'inject' ? 'inject' : 'cdp';
}

export async function relayPush(page: Page, payload: DecryptedPush, origin: string): Promise<void> {
  if (relayMode() === 'inject') {
    await relayInject(page, payload);
  } else {
    await relayCdp(page, payload, origin);
  }
}

async function relayCdp(page: Page, payload: DecryptedPush, origin: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const registrationId = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP: no service worker registration')), 8000);
    cdp.on(
      'ServiceWorker.workerRegistrationUpdated',
      (event: {
        registrations?: { registrationId: string; scopeURL?: string; isDeleted?: boolean }[];
      }) => {
        const match = event.registrations?.find(
          (r) => !r.isDeleted && (r.scopeURL ?? '').startsWith(origin),
        );
        if (match) {
          clearTimeout(timer);
          resolve(match.registrationId);
        }
      },
    );
    cdp.send('ServiceWorker.enable').catch(reject);
  });

  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin,
    registrationId,
    data: JSON.stringify(payload),
  });
}

async function relayInject(page: Page, payload: DecryptedPush): Promise<void> {
  await page.evaluate(async (p) => {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ __inject_push: true, title: p.title, body: p.body });
  }, payload);
}

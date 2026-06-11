import type { Fetcher } from './types.js';
import type { Browser } from 'playwright-core';

// Coupled to the camoufox sidecar contract — see .omc/plans/camoufox-sidecar-split.md.
// A TCP-reachable but WS-unresponsive sidecar (browser still booting) would otherwise hang
// firefox.connect() forever, so every connect carries an explicit timeout.
const CONNECT_TIMEOUT_MS = 10_000;

let browserPromise: Promise<Browser> | null = null;

async function createBrowser(): Promise<Browser> {
  const { firefox } = await import('playwright-core');
  const endpoint = process.env.CAMOUFOX_WS_ENDPOINT;

  // CAMOUFOX_WS_ENDPOINT is the full WS URL including the pinned path
  // (e.g. ws://camoufox:9222/reading-notifs). It is passed straight to firefox.connect()
  // — no URL manipulation, no HTTP /json discovery.
  const browser = endpoint
    ? await firefox.connect(endpoint, { timeout: CONNECT_TIMEOUT_MS })
    : await firefox.launch(await (await import('camoufox-js')).launchOptions({ headless: true }));

  // A disconnect (sidecar restart/crash, or local browser exit) invalidates the cached
  // promise so the next getBrowser() reconnects/relaunches transparently.
  browser.on('disconnected', () => {
    browserPromise = null;
  });

  return browser;
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = createBrowser().catch((err) => {
      // Never cache a rejected promise — null it so the next attempt retries cleanly.
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Startup probe used by the bootstrap chain when CAMOUFOX_WS_ENDPOINT is set: establishes
 * the connection once and confirms it is live, failing fast (no retries) if the sidecar is
 * down or unresponsive. The firefox.connect() timeout is the primary hang guard; the
 * Promise.race here is defense-in-depth so a connect that never settles still rejects.
 */
export async function ensureBrowserConnectivity(): Promise<void> {
  const browser = await withTimeout(
    getBrowser(),
    CONNECT_TIMEOUT_MS,
    `camoufox WS connect did not complete within ${CONNECT_TIMEOUT_MS}ms`,
  );
  if (!browser.isConnected()) {
    throw new Error('camoufox browser connected but reports a dead connection');
  }
}

export class StealthFetcher implements Fetcher {
  async fetch(url: string): Promise<string> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return await page.content();
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (browserPromise) {
      const browser = await browserPromise;
      await browser.close();
      browserPromise = null;
    }
  }
}

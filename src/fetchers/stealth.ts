import type { Fetcher } from './types.js';
import type { Browser } from 'playwright-core';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { launchOptions } = await import('camoufox-js');
      const { firefox } = await import('playwright-core');
      return firefox.launch(await launchOptions({ headless: true }));
    })();
  }
  return browserPromise;
}

export class StealthFetcher implements Fetcher {
  async fetch(url: string): Promise<string> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return page.content();
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

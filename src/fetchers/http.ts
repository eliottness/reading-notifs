import type { Fetcher } from './types.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const FETCH_TIMEOUT_MS = 30_000;

export class HttpFetcher implements Fetcher {
  async fetch(url: string): Promise<string> {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const res = await globalThis.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return res.text();
  }
}

import type { Fetcher, FetcherStrategy } from './types.js';
import { HttpFetcher } from './http.js';
import { StealthFetcher } from './stealth.js';

const stealthFetcher = new StealthFetcher();

// Test-only fetcher override. Registered exclusively via __setTestFetchOverride when TEST_MODE is
// set; production code paths (TEST_MODE unset) never touch this and behave byte-identically.
let testFetchOverride: ((url: string) => string | undefined) | null = null;

export function __setTestFetchOverride(fn: ((url: string) => string | undefined) | null): void {
  if (!process.env.TEST_MODE) return;
  testFetchOverride = fn;
}

export function getFetcher(strategy: FetcherStrategy): Fetcher {
  if (process.env.TEST_MODE && testFetchOverride) {
    const override = testFetchOverride;
    return {
      async fetch(url: string): Promise<string> {
        const staged = override(url);
        if (staged !== undefined) return staged;
        // Hard-block any un-staged URL so tests can never reach a live host.
        throw new Error(`TEST_MODE: no staged fetch content for ${url}`);
      },
    };
  }
  switch (strategy) {
    case 'http':
      return new HttpFetcher();
    case 'stealth':
      return stealthFetcher;
  }
}

export { HttpFetcher, StealthFetcher };
export type { Fetcher, FetcherStrategy };

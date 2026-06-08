import type { Fetcher, FetcherStrategy } from './types.js';
import { HttpFetcher } from './http.js';
import { StealthFetcher } from './stealth.js';

const stealthFetcher = new StealthFetcher();

export function getFetcher(strategy: FetcherStrategy): Fetcher {
  switch (strategy) {
    case 'http':
      return new HttpFetcher();
    case 'stealth':
      return stealthFetcher;
  }
}

export { HttpFetcher, StealthFetcher };
export type { Fetcher, FetcherStrategy };

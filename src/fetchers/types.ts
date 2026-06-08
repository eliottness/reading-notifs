export interface Fetcher {
  fetch(url: string): Promise<string>;
  close?(): Promise<void>;
}

export type FetcherStrategy = 'http' | 'stealth';

import type { FetcherStrategy } from '../fetchers/types.js';

export interface SiteAdapter {
  slug: string;
  name: string;
  fetcherStrategy: FetcherStrategy;
  defaultPollIntervalMinutes: number;
  /** CSS selector pointing to the chapter list / latest chapter element */
  chapterSelector: string;
  /** Extract the latest chapter number from fetched content (HTML or JSON string) */
  extractChapterCount(content: string): number | null;
  /** Return true if the given URL belongs to this site */
  matchesUrl(url: string): boolean;
}

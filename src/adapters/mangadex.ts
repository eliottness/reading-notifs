import type { SiteAdapter } from './types.js';

export const mangaDexAdapter: SiteAdapter = {
  slug: 'mangadex',
  name: 'MangaDex',
  fetcherStrategy: 'http',
  defaultPollIntervalMinutes: 15,
  chapterSelector: '',

  extractChapterCount(content: string): number | null {
    try {
      // content is the JSON response from the MangaDex /manga/{id}/aggregate endpoint
      const data = JSON.parse(content) as {
        result?: string;
        volumes?: Record<string, { chapters?: Record<string, unknown> }>;
      };
      if (data.result !== 'ok' || !data.volumes) return null;
      // Count total chapters across all volumes
      let count = 0;
      for (const vol of Object.values(data.volumes)) {
        count += Object.keys(vol.chapters ?? {}).length;
      }
      return count > 0 ? count : null;
    } catch {
      return null;
    }
  },

  matchesUrl(url: string): boolean {
    return url.includes('mangadex.org');
  },
};

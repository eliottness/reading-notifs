import { load } from 'cheerio';
import type { SiteAdapter } from './types.js';

export const asuraScansAdapter: SiteAdapter = {
  slug: 'asura-scans',
  name: 'Asura Scans',
  fetcherStrategy: 'stealth',
  defaultPollIntervalMinutes: 30,
  chapterSelector: '.eph-num a, .chapternum',

  extractChapterCount(content: string): number | null {
    const $ = load(content);
    // Chapter items are listed newest-first; grab the first (latest) chapter number
    const first =
      $('li[data-num]').first().attr('data-num') ?? $('.eph-num a').first().text().trim();
    if (!first) return null;
    const match = String(first).match(/[\d.]+/);
    return match ? Math.floor(parseFloat(match[0])) : null;
  },

  matchesUrl(url: string): boolean {
    return url.includes('asurascans.com') || url.includes('asuracomics.com');
  },
};

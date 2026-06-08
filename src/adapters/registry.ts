import type { SiteAdapter } from './types.js';
import { asuraScansAdapter } from './asura-scans.js';
import { mangaDexAdapter } from './mangadex.js';

const adapters: SiteAdapter[] = [asuraScansAdapter, mangaDexAdapter];

const bySlug = new Map(adapters.map((a) => [a.slug, a]));

export function getAdapterBySlug(slug: string): SiteAdapter | undefined {
  return bySlug.get(slug);
}

export function getAdapterForUrl(url: string): SiteAdapter | undefined {
  return adapters.find((a) => a.matchesUrl(url));
}

export function getAllAdapters(): SiteAdapter[] {
  return adapters;
}

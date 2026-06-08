import { describe, it, expect } from 'vitest';
import { StealthFetcher } from '../../src/fetchers/stealth.js';

// Integration test — requires a real browser (Playwright + stealth plugin).
// Skipped by default; run with: INTEGRATION=1 npm test
const runIntegration = process.env.INTEGRATION === '1';

describe.skipIf(!runIntegration)('Stealth fetcher (integration)', () => {
  it('fetches page content using headless browser', async () => {
    const fetcher = new StealthFetcher();
    try {
      const html = await fetcher.fetch('https://example.com');
      expect(html).toContain('<html');
      expect(html.length).toBeGreaterThan(100);
    } finally {
      await fetcher.close();
    }
  }, 60_000);
});

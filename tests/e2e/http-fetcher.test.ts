import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import type { Server } from 'http';
import { HttpFetcher } from '../../src/fetchers/http.js';

const SAMPLE_HTML = `<!DOCTYPE html><html><body><h1>Test Chapter Page</h1><p>Chapter 42</p></body></html>`;

describe('HTTP fetcher (E2E)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SAMPLE_HTML);
      });
      server.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res())));
  });

  it('fetches HTML content from a local server', async () => {
    const fetcher = new HttpFetcher();
    const html = await fetcher.fetch(baseUrl);
    expect(html).toContain('Test Chapter Page');
    expect(html).toContain('Chapter 42');
  });

  it('throws on non-200 response', async () => {
    const errorServer = await new Promise<{ server: Server; url: string }>((resolve) => {
      const s = createServer((_req, res) => {
        res.writeHead(404);
        res.end('Not Found');
      });
      s.listen(0, () => {
        const addr = s.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({ server: s, url: `http://localhost:${port}` });
      });
    });

    const fetcher = new HttpFetcher();
    await expect(fetcher.fetch(errorServer.url)).rejects.toThrow('HTTP 404');
    await new Promise<void>((res, rej) =>
      errorServer.server.close((err) => (err ? rej(err) : res())),
    );
  });
});

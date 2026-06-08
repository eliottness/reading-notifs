import { createServer } from 'http';
import type { IncomingMessage, Server } from 'http';

export interface CapturedWebhook {
  body: Record<string, unknown>;
}

export function createMockDiscordWebhook(port = 0): Promise<{
  server: Server;
  requests: CapturedWebhook[];
  url: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const requests: CapturedWebhook[] = [];

    const server = createServer((req: IncomingMessage, res) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          requests.push({ body: JSON.parse(data) as Record<string, unknown> });
        } catch {
          requests.push({ body: {} });
        }
        res.writeHead(204);
        res.end();
      });
    });

    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        requests,
        url: `http://localhost:${actualPort}/webhook`,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

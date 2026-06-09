// Local stand-in for the FCM/push endpoint. Holds a test-owned ECDH subscription keypair, accepts
// the real encrypted web-push POST that pushProvider.send makes, and decrypts it with http_ece
// (web-push's own aes128gcm engine) using the test-held private key — proving a genuine encryption
// hop. Decrypted {title, body} payloads land in `received` for assertions and relay.
import { createServer } from 'node:https';
import type { Server } from 'node:https';
import { createECDH, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { getMockCert } from './gen-cert.js';

// web-push uses https.request unconditionally, so the mock endpoint must be HTTPS. A self-signed
// cert (CN=localhost, SAN 127.0.0.1) is generated at runtime in the system temp dir (never
// committed) and presented here; the e2e server runs with NODE_TLS_REJECT_UNAUTHORIZED=0.

const require = createRequire(import.meta.url);
const ece = require('http_ece') as {
  decrypt: (buffer: Buffer, params: Record<string, unknown>) => Buffer;
};

export interface DecryptedPush {
  title: string;
  body: string;
}

export interface MockPushService {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  received: DecryptedPush[];
  /** Resolves with the most recent decrypted push once at least one has arrived. */
  waitForPush(timeoutMs?: number): Promise<DecryptedPush>;
  /** Resolves once `count` total pushes have been received (or rejects after timeoutMs). */
  waitForCount(count: number, timeoutMs?: number): Promise<DecryptedPush[]>;
  close(): Promise<void>;
}

export async function createMockPushService(): Promise<MockPushService> {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const authSecret = randomBytes(16);

  const received: DecryptedPush[] = [];
  const countWaiters: { count: number; resolve: () => void }[] = [];

  function notifyWaiters() {
    for (let i = countWaiters.length - 1; i >= 0; i--) {
      if (received.length >= countWaiters[i].count) {
        countWaiters[i].resolve();
        countWaiters.splice(i, 1);
      }
    }
  }

  const { key, cert } = getMockCert();
  const server: Server = createServer({ key, cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const decrypted = ece.decrypt(body, {
          version: 'aes128gcm',
          privateKey: ecdh,
          authSecret,
        });
        const payload = JSON.parse(decrypted.toString('utf8')) as DecryptedPush;
        received.push(payload);
        notifyWaiters();
      } catch (err) {
        // Surface decryption failures loudly so tests don't silently pass.
        console.error('mock-push-service decrypt failed:', err);
      }
      res.writeHead(201);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    endpoint: `https://127.0.0.1:${port}/push`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: authSecret.toString('base64url'),
    },
    received,
    async waitForPush(timeoutMs = 5000) {
      await this.waitForCount(1, timeoutMs);
      return received[received.length - 1];
    },
    waitForCount(count, timeoutMs = 5000) {
      if (received.length >= count) return Promise.resolve(received.slice());
      return new Promise<DecryptedPush[]>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error(`timed out waiting for ${count} push(es); got ${received.length}`)),
          timeoutMs,
        );
        countWaiters.push({
          count,
          resolve: () => {
            clearTimeout(timer);
            resolve(received.slice());
          },
        });
      });
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

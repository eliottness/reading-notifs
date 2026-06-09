// Generates a short-lived self-signed TLS cert for the mock push HTTPS server at RUNTIME, written
// only to the system temp dir (never the repo). Secrets must not be committed, even for mocks.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let cached: { key: Buffer; cert: Buffer } | null = null;

export function getMockCert(): { key: Buffer; cert: Buffer } {
  if (cached) return cached;

  const dir = mkdtempSync(join(tmpdir(), 'reading-notifs-mockcert-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore' },
    );
    cached = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
    return cached;
  } finally {
    // The PEM bytes are held in memory; the temp files are no longer needed.
    rmSync(dir, { recursive: true, force: true });
  }
}

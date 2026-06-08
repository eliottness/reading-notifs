import { SMTPServer } from 'smtp-server';
import type { SMTPServerDataStream } from 'smtp-server';
import { Writable } from 'stream';

export interface CapturedEmail {
  from: string;
  to: string[];
  subject: string;
  body: string;
}

export function createMockSmtp(port = 0): Promise<{
  server: SMTPServer;
  emails: CapturedEmail[];
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const emails: CapturedEmail[] = [];

    const server = new SMTPServer({
      authOptional: true,
      onData(stream: SMTPServerDataStream, _session, callback) {
        let body = '';
        const writable = new Writable({
          write(chunk, _enc, cb) {
            body += chunk.toString();
            cb();
          },
        });
        stream.pipe(writable);
        stream.on('end', () => {
          const subjectMatch = body.match(/^Subject: (.+)$/m);
          emails.push({
            from: _session.envelope.mailFrom ? String(_session.envelope.mailFrom.address) : '',
            to: _session.envelope.rcptTo.map((r) => r.address),
            subject: subjectMatch ? subjectMatch[1].trim() : '',
            body,
          });
          callback();
        });
      },
    });

    server.listen(port, () => {
      const addr = server.server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        emails,
        port: actualPort,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

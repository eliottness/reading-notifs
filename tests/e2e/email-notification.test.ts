import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMockSmtp } from '../helpers/mock-smtp.js';

describe('Email notification provider (E2E)', () => {
  let smtp: Awaited<ReturnType<typeof createMockSmtp>>;

  beforeAll(async () => {
    smtp = await createMockSmtp();
    // Set env vars before lazy transporter is created
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = String(smtp.port);
    process.env.SMTP_FROM = 'test@reading-notifs.local';
    // Reset the transporter singleton so it picks up the new env
    const { resetTransporter } = await import('../../src/email/index.js');
    resetTransporter();
  });

  afterAll(async () => {
    await smtp.close();
  });

  it('sends an email with the work title in the subject', async () => {
    const { emailProvider } = await import('../../src/notifications/providers/email.js');

    const result = await emailProvider.send({
      channelConfig: { address: 'reader@example.com' },
      workTitle: 'Solo Leveling',
      newChapterCount: 200,
    });

    if (!result.success) console.error('Email send error:', result.error);
    expect(result.success).toBe(true);
    expect(smtp.emails.length).toBeGreaterThan(0);
    const email = smtp.emails[smtp.emails.length - 1];
    expect(email.subject).toContain('Solo Leveling');
    expect(email.to).toContain('reader@example.com');
  });
});

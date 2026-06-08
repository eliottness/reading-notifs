import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMockDiscordWebhook } from '../helpers/mock-discord.js';
import { discordProvider } from '../../src/notifications/providers/discord.js';

describe('Discord webhook notification provider (E2E)', () => {
  let webhook: Awaited<ReturnType<typeof createMockDiscordWebhook>>;

  beforeAll(async () => {
    webhook = await createMockDiscordWebhook();
  });

  afterAll(async () => {
    await webhook.close();
  });

  it('posts to the webhook URL with the work title in the message', async () => {
    const result = await discordProvider.send({
      channelConfig: { webhookUrl: webhook.url },
      workTitle: 'Chainsaw Man',
      newChapterCount: 185,
    });

    expect(result.success).toBe(true);
    expect(webhook.requests.length).toBeGreaterThan(0);

    const req = webhook.requests[webhook.requests.length - 1];
    expect(String(req.body.content)).toContain('Chainsaw Man');
  });

  it('returns failure when webhook URL is invalid', async () => {
    const result = await discordProvider.send({
      channelConfig: { webhookUrl: 'http://localhost:0/invalid' },
      workTitle: 'Test',
      newChapterCount: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

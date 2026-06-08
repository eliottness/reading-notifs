import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
  },
}));

describe('Browser push notification provider (E2E)', () => {
  beforeAll(() => {
    process.env.VAPID_PUBLIC_KEY =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls';
  });

  it('sends a push notification with correct payload', async () => {
    // Import after mock is set up
    const webpush = (await import('web-push')).default;
    const { pushProvider } = await import('../../src/notifications/providers/push.js');

    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    };

    const result = await pushProvider.send({
      channelConfig: mockSubscription,
      workTitle: 'One Piece',
      newChapterCount: 1120,
    });

    expect(result.success).toBe(true);
    expect(webpush.sendNotification).toHaveBeenCalledOnce();

    const [, payload] = vi.mocked(webpush.sendNotification).mock.calls[0];
    const parsed = JSON.parse(payload as string) as { title: string; body: string };
    expect(parsed.title).toBe('One Piece');
    expect(parsed.body).toBe('New chapter available!');
  });
});

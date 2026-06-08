import webpush from 'web-push';
import type { NotificationProvider } from '../types.js';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT ?? 'mailto:admin@reading-notifs.local';
  if (pub && priv) {
    webpush.setVapidDetails(sub, pub, priv);
    vapidConfigured = true;
  }
}

export const pushProvider: NotificationProvider = {
  type: 'push',

  async send({ channelConfig, workTitle }) {
    try {
      ensureVapid();
      if (!vapidConfigured) {
        return {
          success: false,
          error: 'VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY',
        };
      }
      const subscription = channelConfig as unknown as webpush.PushSubscription;
      const payload = JSON.stringify({ title: workTitle, body: 'New chapter available!' });
      await webpush.sendNotification(subscription, payload);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

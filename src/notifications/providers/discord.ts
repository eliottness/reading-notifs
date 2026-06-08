import type { NotificationProvider } from '../types.js';

export const discordProvider: NotificationProvider = {
  type: 'discord',

  async send({ channelConfig, workTitle }) {
    try {
      const config = channelConfig as { webhookUrl: string };
      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `New chapter of **${workTitle}** is available!` }),
      });
      if (!res.ok) {
        return { success: false, error: `Discord responded with ${res.status}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

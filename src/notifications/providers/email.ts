import type { NotificationProvider } from '../types.js';
import { sendEmail } from '../../email/index.js';

export const emailProvider: NotificationProvider = {
  type: 'email',

  async send({ channelConfig, workTitle }) {
    try {
      const config = channelConfig as { address: string };
      await sendEmail({
        to: config.address,
        subject: `New chapter available: ${workTitle}`,
        text: `A new chapter of "${workTitle}" is now available!`,
        html: `<p>A new chapter of <strong>${workTitle}</strong> is now available!</p>`,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

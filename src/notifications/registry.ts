import type { NotificationProvider } from './types.js';
import { emailProvider } from './providers/email.js';
import { pushProvider } from './providers/push.js';
import { discordProvider } from './providers/discord.js';

const providers: NotificationProvider[] = [emailProvider, pushProvider, discordProvider];
const byType = new Map(providers.map((p) => [p.type, p]));

export function getProvider(type: string): NotificationProvider | undefined {
  return byType.get(type as NotificationProvider['type']);
}

export function getAllProviders(): NotificationProvider[] {
  return providers;
}

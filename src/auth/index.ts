import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { db } from '../db/index.js';
import { sendEmail } from '../email/index.js';
import { isEmailAllowed } from './allowlist.js';
import { logger } from '../logger.js';
import * as schema from '../db/schema.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: (() => {
    const s = process.env.BETTER_AUTH_SECRET;
    if (!s) throw new Error('BETTER_AUTH_SECRET env var must be set');
    return s;
  })(),
  baseURL: process.env.APP_URL ?? 'http://localhost:3000',
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Access-control gate (see src/auth/allowlist.ts). This is the bypass-proof choke point:
        // both the custom /auth/send-magic-link route and the native /api/auth/** endpoint reach
        // here, so a disallowed email never receives a link and therefore can never sign up or in.
        // We return early (rather than throw) so the caller still sees the normal success path —
        // the UI shows the generic "Check your email" message, leaking nothing about the allowlist.
        // Note: better-auth has already written a verification token row by this point; that token
        // simply expires unused (~5 min, infeasible to guess) — harmless, not a bug.
        if (!isEmailAllowed(email)) {
          logger.warn('magic_link_blocked', { email_domain: email.split('@')[1] });
          return;
        }
        // TEST_MODE-only: stash the verify URL so /__test__/login can mint a session fast
        // without an email round-trip. Inert in prod; the email is still sent below regardless.
        if (process.env.TEST_MODE) {
          const { recordMagicLink } = await import('../test-support/state.js');
          recordMagicLink(email, url);
        }
        await sendEmail({
          to: email,
          subject: 'Your reading-notifs login link',
          text: `Click the link to log in: ${url}`,
          html: `<p>Click <a href="${url}">here</a> to log in to reading-notifs.</p>`,
        });
      },
    }),
  ],
});

export type Auth = typeof auth;

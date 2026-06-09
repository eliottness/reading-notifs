import type { Context, Next } from 'hono';
import { auth } from './index.js';
import { isAdmin } from './admin.js';

export async function requireAuth(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.redirect('/login');
    }
    c.set('user', session.user);
    c.set('session', session.session);
    await next();
  } catch {
    return c.redirect('/login');
  }
}

// Gate for the JSON-only /admin/* endpoints. Self-contained (does its own getSession) so it is
// order-independent and never relies on requireAuth having run first. Unlike requireAuth it returns
// JSON status codes rather than redirecting to /login, since these endpoints are called via fetch.
// Authenticate first, then authorize: no session → 401, authenticated non-admin → 403.
export async function requireAdmin(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (!isAdmin(session.user.email)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    c.set('user', session.user);
    c.set('session', session.session);
    await next();
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
}

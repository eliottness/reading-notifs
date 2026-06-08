import type { Context, Next } from 'hono';
import { auth } from './index.js';

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

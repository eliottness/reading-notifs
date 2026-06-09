// Admin identity is driven entirely by the ADMIN_EMAILS env var (comma-separated emails) — there is
// no role column in the database. This is deliberate: admin status is a deploy-time concern for this
// single-operator app, instantly changed by editing the env and restarting. See src/auth/middleware.ts
// (requireAdmin) for the gate and src/app.tsx for the admin-only endpoints.
//
// Parsed per-call rather than memoized: the cost is trivial and it keeps tests able to mutate
// process.env.ADMIN_EMAILS between cases.

export function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean), // fail closed: unset/empty/whitespace-only ⇒ zero admins, never "allow all"
  );
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}

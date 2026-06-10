// Sign-in/sign-up access control, driven entirely by two env vars (mirrors src/auth/admin.ts):
//   ALLOWED_DOMAINS — comma-separated email domains  (e.g. "datadoghq.com, example.org")
//   ALLOWED_EMAILS  — comma-separated individual emails (e.g. "alice@gmail.com")
// Matching is case-insensitive. An email is allowed if it matches ALLOWED_EMAILS exactly OR its
// domain matches an ALLOWED_DOMAINS entry (union).
//
// Deliberately the OPPOSITE default of ADMIN_EMAILS: when BOTH vars are unset/empty the allowlist
// is disabled and everyone may sign in (backward-compatible — restriction activates only once a
// var is set). See src/auth/index.ts (sendMagicLink guard) and src/app.tsx (/auth/send-magic-link).
//
// Parsed per-call rather than memoized: the cost is trivial and it keeps tests able to mutate
// process.env between cases.

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedDomains(): Set<string> {
  // Strip a leading "@" so both "@example.com" and "example.com" entries work.
  return new Set(parseList(process.env.ALLOWED_DOMAINS).map((d) => d.replace(/^@/, '')));
}

export function getAllowedEmails(): Set<string> {
  return new Set(parseList(process.env.ALLOWED_EMAILS));
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const domains = getAllowedDomains();
  const emails = getAllowedEmails();

  // Both empty ⇒ allowlist disabled ⇒ allow everyone (the unset default).
  if (domains.size === 0 && emails.size === 0) return true;

  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  if (emails.has(normalized)) return true;

  // Domain = segment after the LAST "@"; pop() also yields the whole string when there is no "@",
  // so guard explicitly to reject malformed addresses like "foobar".
  if (!normalized.includes('@')) return false;
  const domain = normalized.split('@').pop();
  return domain ? domains.has(domain) : false;
}

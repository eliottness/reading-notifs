// Shared in-process state for the TEST_MODE seam. This module is only ever imported behind a
// `process.env.TEST_MODE` guard (from app.tsx and the e2e server-entry), so it is inert in prod.

// Staged fetcher content keyed by exact URL, consumed by the fetcher override in src/fetchers.
export const stagedFetches = new Map<string, string>();

// Captured magic-link verify URLs keyed by email (latest wins). Populated by the TEST_MODE branch
// of the better-auth sendMagicLink callback; consumed by POST /__test__/login.
const magicLinks = new Map<string, string>();

export function recordMagicLink(email: string, url: string): void {
  magicLinks.set(email.toLowerCase(), url);
}

export function takeMagicLink(email: string): string | undefined {
  const key = email.toLowerCase();
  const url = magicLinks.get(key);
  magicLinks.delete(key);
  return url;
}

// Minimal shape of a captured email; structural to avoid coupling src/ to tests/ types.
export interface CapturedEmailLike {
  to: string[];
  subject: string;
  body: string;
}

// Reference to the mock-SMTP capture array, wired up by the e2e server-entry. Read by GET
// /__test__/emails so the real magic-link flow can be asserted across the process boundary.
let emailsRef: CapturedEmailLike[] = [];

export function setEmailsRef(ref: CapturedEmailLike[]): void {
  emailsRef = ref;
}

export function getEmails(): CapturedEmailLike[] {
  return emailsRef;
}

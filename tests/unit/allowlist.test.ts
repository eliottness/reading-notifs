import { describe, it, expect, afterEach } from 'vitest';
import { getAllowedDomains, getAllowedEmails, isEmailAllowed } from '../../src/auth/allowlist.js';

const ORIGINAL_DOMAINS = process.env.ALLOWED_DOMAINS;
const ORIGINAL_EMAILS = process.env.ALLOWED_EMAILS;

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('ALLOWED_DOMAINS', ORIGINAL_DOMAINS);
  restore('ALLOWED_EMAILS', ORIGINAL_EMAILS);
});

function setAllowlist(domains?: string, emails?: string): void {
  if (domains === undefined) delete process.env.ALLOWED_DOMAINS;
  else process.env.ALLOWED_DOMAINS = domains;
  if (emails === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = emails;
}

describe('getAllowedDomains / getAllowedEmails', () => {
  it('return empty sets when unset', () => {
    setAllowlist();
    expect(getAllowedDomains().size).toBe(0);
    expect(getAllowedEmails().size).toBe(0);
  });

  it('parse, trim, and lowercase comma-separated entries', () => {
    setAllowlist('Example.com, FOO.org ', ' Alice@X.com ');
    expect(getAllowedDomains()).toEqual(new Set(['example.com', 'foo.org']));
    expect(getAllowedEmails()).toEqual(new Set(['alice@x.com']));
  });

  it('strip a leading "@" from domain entries', () => {
    setAllowlist('@example.com', '');
    expect(getAllowedDomains().has('example.com')).toBe(true);
  });

  it('ignore whitespace/comma-only values', () => {
    setAllowlist(' , , ', '  ');
    expect(getAllowedDomains().size).toBe(0);
    expect(getAllowedEmails().size).toBe(0);
  });
});

describe('isEmailAllowed', () => {
  it('allows everyone when both vars are unset (default)', () => {
    setAllowlist();
    expect(isEmailAllowed('anyone@anywhere.com')).toBe(true);
  });

  it('allows everyone when both vars are set-but-empty', () => {
    setAllowlist('', '');
    expect(isEmailAllowed('anyone@anywhere.com')).toBe(true);
  });

  it('matches on domain (case-insensitive)', () => {
    setAllowlist('example.com', '');
    expect(isEmailAllowed('Bob@Example.COM')).toBe(true);
    expect(isEmailAllowed('bob@other.com')).toBe(false);
  });

  it('matches on individual email when only ALLOWED_EMAILS is set', () => {
    setAllowlist('', 'alice@gmail.com');
    expect(isEmailAllowed('Alice@Gmail.com')).toBe(true);
    expect(isEmailAllowed('bob@gmail.com')).toBe(false);
  });

  it('is a union: allowed if EITHER list matches', () => {
    setAllowlist('example.com', 'alice@gmail.com');
    expect(isEmailAllowed('anyone@example.com')).toBe(true); // domain side
    expect(isEmailAllowed('alice@gmail.com')).toBe(true); // email side
    expect(isEmailAllowed('bob@gmail.com')).toBe(false); // neither
  });

  it('uses the segment after the LAST "@" for multiple-@ inputs', () => {
    setAllowlist('example.com', '');
    expect(isEmailAllowed('a@b@example.com')).toBe(true);
    expect(isEmailAllowed('a@b@evil.com')).toBe(false);
  });

  it('rejects an address with no "@" even if it equals a domain entry', () => {
    setAllowlist('example.com', '');
    expect(isEmailAllowed('example.com')).toBe(false);
    expect(isEmailAllowed('foobar')).toBe(false);
  });

  it('does not match a leading-dot or substring domain', () => {
    setAllowlist('example.com', '');
    expect(isEmailAllowed('bob@evil-example.com')).toBe(false);
    expect(isEmailAllowed('bob@sub.example.com')).toBe(false);
  });

  it('rejects empty/undefined/null email when the allowlist is active', () => {
    setAllowlist('example.com', '');
    expect(isEmailAllowed('')).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
  });
});

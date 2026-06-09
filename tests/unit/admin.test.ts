import { describe, it, expect, afterEach } from 'vitest';
import { getAdminEmails, isAdmin } from '../../src/auth/admin.js';

const ORIGINAL = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe('getAdminEmails', () => {
  it('returns an empty set when unset', () => {
    delete process.env.ADMIN_EMAILS;
    expect(getAdminEmails().size).toBe(0);
  });

  it('returns an empty set for an empty string', () => {
    process.env.ADMIN_EMAILS = '';
    expect(getAdminEmails().size).toBe(0);
  });

  it('returns an empty set for whitespace/commas only', () => {
    process.env.ADMIN_EMAILS = '  , , ';
    expect(getAdminEmails().size).toBe(0);
  });

  it('parses a single email', () => {
    process.env.ADMIN_EMAILS = 'a@x.com';
    expect([...getAdminEmails()]).toEqual(['a@x.com']);
  });

  it('parses multiple emails and trims surrounding spaces', () => {
    process.env.ADMIN_EMAILS = 'a@x.com, b@y.com ,  c@z.com  ';
    expect(getAdminEmails()).toEqual(new Set(['a@x.com', 'b@y.com', 'c@z.com']));
  });

  it('lowercases entries', () => {
    process.env.ADMIN_EMAILS = 'Alice@X.COM';
    expect(getAdminEmails().has('alice@x.com')).toBe(true);
  });
});

describe('isAdmin', () => {
  it('matches case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'alice@x.com';
    expect(isAdmin('Alice@X.com')).toBe(true);
  });

  it('rejects non-members', () => {
    process.env.ADMIN_EMAILS = 'alice@x.com';
    expect(isAdmin('bob@x.com')).toBe(false);
  });

  it('fails closed on empty/undefined/null input', () => {
    process.env.ADMIN_EMAILS = 'alice@x.com';
    expect(isAdmin('')).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('rejects everyone when ADMIN_EMAILS is empty (fail closed)', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdmin('alice@x.com')).toBe(false);
  });
});

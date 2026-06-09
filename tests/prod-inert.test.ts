import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The vitest config sets TEST_MODE=1 (the route suites use the /__test__ seam), and src/app.tsx
// reads TEST_MODE at import time — so "inert without TEST_MODE" can only be verified in a fresh
// process. This spawns prod-inert-probe.ts with TEST_MODE removed (and NODE_ENV non-production to
// avoid the boot tripwire) and asserts the test backdoors are absent. Covers Acceptance #3 / #11.
describe('TEST_MODE seam is provably inert in a production-shaped boot', () => {
  it('does not mount /__test__ routes and uses the real fetchers', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const probe = join(here, 'prod-inert-probe.ts');
    const tsx = join(here, '..', 'node_modules', '.bin', 'tsx');

    const env = { ...process.env };
    delete env.TEST_MODE;
    env.NODE_ENV = 'development';
    env.BETTER_AUTH_SECRET = 'test-secret';
    env.DATABASE_URL = ':memory:';

    const out = execFileSync(tsx, [probe], { env, encoding: 'utf8' });
    const match = out.match(/PROBE_RESULT=(\{.*\})/);
    expect(match, `probe output:\n${out}`).toBeTruthy();

    const result = JSON.parse(match![1]) as {
      login: number;
      check: number;
      reset: number;
      isHttp: boolean;
    };
    expect(result.login).toBe(404);
    expect(result.check).toBe(404);
    expect(result.reset).toBe(404);
    expect(result.isHttp).toBe(true);
  });
});

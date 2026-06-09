// Spawned by prod-inert.test.ts in a SEPARATE process with TEST_MODE unset (the vitest config sets
// TEST_MODE=1 for the route suites, and src/app.tsx reads it at import time, so a prod-shaped boot
// can only be observed out-of-process). Prints a single PROBE_RESULT line the parent asserts on.
import app from '../src/app.js';
import { getFetcher } from '../src/fetchers/index.js';
import { HttpFetcher } from '../src/fetchers/http.js';

const login = await app.request('http://localhost/__test__/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'x@example.com' }),
});
const check = await app.request('http://localhost/__test__/check/whatever', { method: 'POST' });
const reset = await app.request('http://localhost/__test__/reset', { method: 'POST' });
const isHttp = getFetcher('http') instanceof HttpFetcher;

console.log(
  'PROBE_RESULT=' +
    JSON.stringify({ login: login.status, check: check.status, reset: reset.status, isHttp }),
);
process.exit(0);

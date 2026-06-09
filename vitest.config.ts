import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Belt-and-suspenders: the Playwright suite lives in a top-level tests-e2e/ (outside this glob),
    // but exclude it explicitly so vitest never collects *.spec.ts e2e files.
    exclude: ['tests-e2e/**', 'node_modules/**', 'dist/**'],
    env: {
      DATABASE_URL: ':memory:',
      BETTER_AUTH_SECRET: 'test-secret',
      APP_URL: 'http://localhost:3000',
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: ':memory:',
      BETTER_AUTH_SECRET: 'test-secret',
      APP_URL: 'http://localhost:3000',
    },
  },
});

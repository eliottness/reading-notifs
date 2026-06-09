import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// Fixed test VAPID keypair (also injected into the mock push service so signatures line up).
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ??
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ?? 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls';

export default defineConfig({
  testDir: './tests-e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    permissions: ['notifications'],
    serviceWorkers: 'allow',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'tsx tests-e2e/fixtures/server-entry.ts',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      TEST_MODE: '1',
      NODE_ENV: 'test',
      // web-push posts to the self-signed HTTPS mock push service; accept its cert in this process.
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      PORT: String(PORT),
      // DB path keyed by port so concurrent runs on different E2E_PORTs don't share a database.
      DATABASE_URL: `./.tmp/e2e-${PORT}.db`,
      BETTER_AUTH_SECRET: 'e2e-test-secret',
      APP_URL: BASE_URL,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: 'mailto:e2e@reading-notifs.test',
    },
  },
});

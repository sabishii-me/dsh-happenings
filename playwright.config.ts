import { defineConfig } from '@playwright/test';

const PORT = 8790;
const ENV =
  'TMP=.wrangler/tmp TEMP=.wrangler/tmp XDG_CONFIG_HOME=.wrangler/xdg XDG_CACHE_HOME=.wrangler/xdg/cache';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx cross-env ${ENV} wrangler dev --port ${PORT} --persist-to .wrangler/state`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});

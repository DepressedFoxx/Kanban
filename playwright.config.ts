import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: 'output/playwright/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54329',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_e2e_fixture_only',
    },
  },
})

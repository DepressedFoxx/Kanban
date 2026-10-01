import { defineConfig } from '@playwright/test'
import { loadEnvFile } from 'node:process'
loadEnvFile('.env.local')
loadEnvFile('.env.e2e.local')
export default defineConfig({
  testDir: './e2e-cloud',
  timeout: 300000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  outputDir: 'output/playwright/cloud-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5190',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: false,
  },
})

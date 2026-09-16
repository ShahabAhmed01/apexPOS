import { defineConfig } from '@playwright/test'

/**
 * Electron E2E. Tests boot the packaged main process via playwright's `_electron`
 * launcher. A build (`npm run build`) must exist beforehand; CI handles that.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  outputDir: 'test-results'
})

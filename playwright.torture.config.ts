import { defineConfig } from '@playwright/test'

/**
 * Live torture campaign configuration — separate from the release E2E suite.
 * These specs launch REAL Electron instances (dev build `out/`), drive the
 * actual UI, and independently verify state via node:sqlite against the
 * app's live database file. Instrumentation only: no production behavior is
 * mocked or stubbed unless a spec explicitly says so.
 */
export default defineConfig({
  testDir: 'tests/e2e/torture',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: process.env.TORTURE_WORKERS ? Number(process.env.TORTURE_WORKERS) : 2,
  retries: 0,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: `artifacts/live-torture/${process.env.APEX_TORTURE_RUN ?? 'run-20260926-1415'}/results-playwright.json`
      }
    ]
  ],
  use: {
    trace: 'retain-on-failure',
    video: 'off'
  },
  outputDir: 'test-results/torture'
})

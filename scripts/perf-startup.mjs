// Measures real startup timings of the BUILT app (out/), not the dev server.
// Usage: npm run build && node scripts/perf-startup.mjs
import { _electron as electron } from '@playwright/test'
import { rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const stamp = process.env.APEX_RUN_ID ?? 'local'

const timed = async (label, profilesDir) => {
  rmSync(profilesDir, { recursive: true, force: true })
  mkdirSync(profilesDir, { recursive: true })
  const t0 = performance.now()
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(profilesDir, 'user-data')}`],
    env: { ...process.env, APEXPOS_DATA_DIR: profilesDir, NODE_ENV: 'production' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  const firstPaintMs = performance.now() - t0
  // Timer until onboarding wizard or login screen is interactive
  await page.waitForSelector('text=/Welcome to APEXPOS|Sign in/', { timeout: 20000 })
  const interactiveMs = performance.now() - t0
  await app.close()
  return { label, firstPaintMs: Math.round(firstPaintMs), interactiveMs: Math.round(interactiveMs) }
}

const cold = await timed('cold', `/tmp/apex-perf-cold-${process.pid}`)
// warm: same dir twice
const dir = `/tmp/apex-perf-warm-${process.pid}`
await timed('warm-prime', dir)
const warm = await timed('warm', dir)

const out = { runId: stamp, node: process.version, results: { cold, warm } }
console.log(JSON.stringify(out, null, 2))
import { appendFileSync, mkdirSync as mk } from 'node:fs'
mk(`artifacts/${stamp}/performance`, { recursive: true })
appendFileSync(`artifacts/${stamp}/performance/startup.json`, JSON.stringify(out) + '\n')

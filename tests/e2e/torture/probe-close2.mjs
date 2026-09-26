/**
 * SHUTDOWN PROBE 2 — reproduce the slow/hung quit seen in the campaign.
 *
 * Probe 1 (probe-close.mjs) proved an external DB reader and parallel
 * instances are NOT the cause (15/15 closes in 65-81 ms). The observed
 * hangs happened right after a real login + shell render, so this mode
 * mimics the role-nav tests exactly: launch -> login -> nav read -> close.
 *
 * Output appended to artifacts/live-torture/<run>/shutdown-probe.jsonl
 */
import { _electron as electron } from 'playwright'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const RUN = process.env.APEX_TORTURE_RUN ?? 'run-20260926-1415'
const ART = join('artifacts', 'live-torture', RUN)
const TMP = '/tmp/opencode/apex-torture'
mkdirSync(ART, { recursive: true })

const USERS = { owner: 'Owner123!', cashier: 'Cashier123!', admin: 'Admin123!' }

const N = Number(process.argv[2] ?? 15)
const mode = process.argv[3] ?? 'D-login-close'
const settle = Number(process.argv[4] ?? 0)

for (let i = 0; i < N; i++) {
  const dir = join(TMP, `closeprobe-${mode}-${process.pid}-${i}`)
  const app = await electron.launch({
    timeout: 60_000,
    args: ['.', `--user-data-dir=${join(dir, `ud-${i}`)}`],
    env: {
      ...process.env,
      APEXPOS_DATA_DIR: dir,
      NODE_ENV: 'development',
      APEXPOS_SEED_DEMO: '1'
    }
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  page.setDefaultTimeout(30_000)
  await page.waitForLoadState('load', { timeout: 60_000 })
  const who = i % 2 === 0 ? 'owner' : 'cashier'
  await page.fill('#username', who)
  await page.fill('#password', USERS[who])
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20_000 })
  const links = await page
    .locator('nav[aria-label="Primary"] a')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  if (settle) await page.waitForTimeout(settle)

  const proc = app.process()
  const t0 = Date.now()
  let outcome = 'closed'
  let timer
  await Promise.race([
    app.close().catch(() => 'closed'),
    new Promise((r) => {
      timer = setTimeout(() => r('hung'), 30_000)
    })
  ]).then((v) => (outcome = v))
  clearTimeout(timer)
  const ms = Date.now() - t0
  if (outcome === 'hung') proc.kill('SIGKILL')
  const rec = { mode, i, who, ms, outcome, exitCode: proc.exitCode, nav: links.length }
  appendFileSync(join(ART, 'shutdown-probe.jsonl'), JSON.stringify(rec) + '\n')
  console.log(JSON.stringify(rec))
}

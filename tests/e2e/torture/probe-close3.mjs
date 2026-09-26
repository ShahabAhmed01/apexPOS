/**
 * SHUTDOWN PROBE 3 — is the slow/hung quit load-dependent?
 *
 * Probes 1 & 2 (30 closes) were all 65-91 ms: no external DB reader, parallel
 * instances, or login+nav cycle reproduces the campaign's long tail. This
 * probe applies campaign-like load: N concurrent instances that all log in at
 * once and then all close at once (what `workers: 2` does with heavier tests).
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

const USERS = {
  owner: 'Owner123!',
  cashier: 'Cashier123!',
  admin: 'Admin123!',
  manager: 'Manager123!'
}
const N = Number(process.argv[2] ?? 4)
const ROUNDS = Number(process.argv[3] ?? 4)

const boot = async (dir, i, who) => {
  const app = await electron.launch({
    timeout: 60_000,
    args: ['.', `--user-data-dir=${join(dir, `ud-${i}`)}`],
    env: { ...process.env, APEXPOS_DATA_DIR: dir, NODE_ENV: 'development', APEXPOS_SEED_DEMO: '1' }
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  page.setDefaultTimeout(30_000)
  await page.waitForLoadState('load', { timeout: 60_000 })
  await page.fill('#username', who)
  await page.fill('#password', USERS[who])
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20_000 })
  return { app, page }
}

const shut = async (app, mode, i) => {
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
  const rec = { mode, i, ms, outcome, exitCode: proc.exitCode }
  appendFileSync(join(ART, 'shutdown-probe.jsonl'), JSON.stringify(rec) + '\n')
  console.log(JSON.stringify(rec))
  return ms
}

const roles = Object.keys(USERS)
for (let r = 0; r < ROUNDS; r++) {
  const booted = []
  for (let i = 0; i < N; i++) {
    const dir = join(TMP, `closeprobe-E-${process.pid}-${r}-${i}`)
    booted.push(await boot(dir, `${r}-${i}`, roles[i % roles.length]))
  }
  // concurrent close — the exact condition under test
  await Promise.all(booted.map((b, i) => shut(b.app, `E-concurrent-${N}x${ROUNDS}`, `${r}-${i}`)))
}
console.log('done')

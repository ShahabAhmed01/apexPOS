/**
 * SHUTDOWN PROBE 5 — test the correlation found in the campaign.
 *
 * All three observed hung closes belong to `01-login-session.spec.ts`, whose
 * tests close the app ~100-700 ms after login, and in every case a SIBLING
 * worker was simultaneously driving heavy POS IPC (100-keystroke search /
 * 50-scan barcode flood) when the quit happened.
 *
 * Probes 1-4 (71 closes) never combined "quit immediately after login" with
 * "sibling hammering IPC". This one does:
 *
 *   victim  = loop { launch -> login -> read nav -> close, measure }
 *   load    = one long-lived instance running 100-keystroke search +
 *             50-scan barcode floods continuously
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

const VICTIMS = Number(process.argv[2] ?? 20)

const launch = (dir, tag) =>
  electron.launch({
    timeout: 60_000,
    args: ['.', `--user-data-dir=${join(dir, `ud-${tag}`)}`],
    env: { ...process.env, APEXPOS_DATA_DIR: dir, NODE_ENV: 'development', APEXPOS_SEED_DEMO: '1' }
  })

const login = async (app, user, pw) => {
  const page = await app.firstWindow({ timeout: 60_000 })
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(30_000)
  await page.waitForLoadState('load', { timeout: 60_000 })
  await page.fill('#username', user)
  await page.fill('#password', pw)
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20_000 })
  return page
}

// --- the load generator: one instance hammering IPC for the whole run ------
const loadDir = join(TMP, `closeprobe-G-load-${process.pid}`)
const loadApp = await launch(loadDir, 'load')
const loadPage = await login(loadApp, 'owner', 'Owner123!')
let loadStop = false
const loadLoop = (async () => {
  while (!loadStop) {
    await loadPage.fill('input[aria-label="Search products"]', 'a'.repeat(100))
    await loadPage.waitForTimeout(120)
    await loadPage.fill('input[aria-label="Search products"]', '')
    for (let i = 0; i < 50; i++) {
      await loadPage.keyboard.type('8961001100019', { delay: 0 })
      await loadPage.keyboard.press('Enter')
    }
    await loadPage.waitForTimeout(400)
  }
})().catch(() => {})

// --- the victims: quit immediately after login ----------------------------
const results = []
for (let i = 0; i < VICTIMS; i++) {
  const dir = join(TMP, `closeprobe-G-victim-${process.pid}-${i}`)
  const app = await launch(dir, `v${i}`)
  const page = await login(app, i % 2 ? 'cashier' : 'owner', i % 2 ? 'Cashier123!' : 'Owner123!')
  // exactly what the role-nav test does: read the nav, then quit
  const links = await page
    .locator('nav[aria-label="Primary"] a')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')))

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

  const rec = {
    mode: 'G-quit-after-login-under-load',
    i,
    ms,
    outcome,
    exitCode: proc.exitCode,
    nav: links.length
  }
  results.push(rec)
  appendFileSync(join(ART, 'shutdown-probe.jsonl'), JSON.stringify(rec) + '\n')
  console.log(JSON.stringify(rec))
}

loadStop = true
await loadLoop
try {
  await Promise.race([loadApp.close(), new Promise((r) => setTimeout(r, 15_000))])
} catch {
  /* ignore */
}

const slow = results.filter((r) => r.ms > 1000)
console.log(
  `done: ${results.length} closes, ${slow.length} >1s, ${results.filter((r) => r.outcome === 'hung').length} hung`
)

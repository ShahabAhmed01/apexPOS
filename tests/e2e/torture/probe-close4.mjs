/**
 * SHUTDOWN PROBE 4 — the one condition not yet covered by probes 1-3.
 *
 * Every observed hung close happened inside the POS suite (`02-...spec.ts`),
 * whose tests open a harness `node:sqlite` connection on the app's DB file
 * around the time the app quits. Probe 1 mode B held a reader open but did no
 * UI work; probes 2/3 did UI work but no reader. This combines all three:
 *
 *   launch -> login -> add product to the cart (real IPC) -> harness reader
 *   held open -> close the app -> measure.
 *
 * Output appended to artifacts/live-torture/<run>/shutdown-probe.jsonl
 */
import { _electron as electron } from 'playwright'
import { appendFileSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const RUN = process.env.APEX_TORTURE_RUN ?? 'run-20260926-1415'
const ART = join('artifacts', 'live-torture', RUN)
const TMP = '/tmp/opencode/apex-torture'
mkdirSync(ART, { recursive: true })

const N = Number(process.argv[2] ?? 15)

for (let i = 0; i < N; i++) {
  const dir = join(TMP, `closeprobe-F-${process.pid}-${i}`)
  const app = await electron.launch({
    timeout: 60_000,
    args: ['.', `--user-data-dir=${join(dir, `ud-${i}`)}`],
    env: { ...process.env, APEXPOS_DATA_DIR: dir, NODE_ENV: 'development', APEXPOS_SEED_DEMO: '1' }
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  page.setDefaultTimeout(30_000)
  await page.waitForLoadState('load', { timeout: 60_000 })

  // real login
  await page.fill('#username', 'owner')
  await page.fill('#password', 'Owner123!')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20_000 })

  // real cart activity: search + click a product (several IPC round trips)
  await page.fill('input[aria-label="Search products"]', 'Zinger')
  await page.waitForSelector('button:has-text("Zinger Burger")', { timeout: 10_000 })
  await page.click('button:has-text("Zinger Burger")')
  await page.waitForTimeout(300)

  // harness reader on the SAME file, kept alive across the quit
  const reader = new DatabaseSync(join(dir, 'apexpos.db'))
  reader.exec('PRAGMA busy_timeout = 8000')
  const before = reader.prepare('SELECT COUNT(*) c FROM orders').get()

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

  // does the DB still reconcile after a SIGKILL?
  let integrity = 'unreadable'
  try {
    integrity = JSON.stringify(reader.prepare('PRAGMA integrity_check').get())
  } catch (e) {
    integrity = String(e).slice(0, 80)
  }
  // The reader is held open ACROSS the quit (the condition under test) and
  // released afterwards so the probe process itself can exit.
  try {
    reader.close()
  } catch {
    /* ignore */
  }
  const rec = {
    mode: 'F-login-cart-dbopen',
    i,
    ms,
    outcome,
    exitCode: proc.exitCode,
    before,
    integrity
  }
  appendFileSync(join(ART, 'shutdown-probe.jsonl'), JSON.stringify(rec) + '\n')
  console.log(JSON.stringify(rec))
}
console.log('done')

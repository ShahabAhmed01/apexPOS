/**
 * SHUTDOWN PROBE (instrumentation, not a test).
 *
 * Evidence from events.jsonl: 271 closeApp() calls — p50 79 ms, but a long
 * tail (max 30 101 ms, one had to be SIGKILLed). `ElectronApplication.close()`
 * exposes no timeout, so an unexplained slow quit eats the test budget.
 *
 * This isolates the cause across three modes:
 *   A) serial, no external reader on the DB file
 *   B) serial, an independent node:sqlite reader holds the DB open during close
 *   C) two instances closed concurrently (what `workers: 2` does)
 *
 * Output: artifacts/live-torture/<run>/shutdown-probe.json
 */
import { _electron as electron } from 'playwright'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const RUN = process.env.APEX_TORTURE_RUN ?? 'run-20260926-1415'
const ART = join('artifacts', 'live-torture', RUN)
const TMP = '/tmp/opencode/apex-torture'
mkdirSync(ART, { recursive: true })

let seq = 0
const freshDir = (label) => {
  const dir = join(TMP, `closeprobe-${label}-${process.pid}-${seq++}`)
  return dir
}

const launch = async (dir) =>
  electron.launch({
    timeout: 60_000,
    args: ['.', `--user-data-dir=${join(dir, `ud-${seq}`)}`],
    env: {
      ...process.env,
      APEXPOS_DATA_DIR: dir,
      NODE_ENV: 'development',
      APEXPOS_SEED_DEMO: '1'
    }
  })

const closeOnce = async (app, openReader) => {
  const proc = app.process()
  let reader = null
  if (openReader) {
    reader = new DatabaseSync(join(openReader, 'apexpos.db'))
    reader.exec('PRAGMA busy_timeout = 8000')
    // hold a read transaction open — the pessimistic case
    reader.prepare('SELECT COUNT(*) c FROM orders').get()
  }
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
  if (reader) {
    try {
      reader.close()
    } catch {
      /* ignore */
    }
  }
  return { ms, outcome, exitCode: proc.exitCode }
}

const results = { startedAt: new Date().toISOString(), modes: {} }
const record = (mode, r) => {
  results.modes[mode] ??= []
  results.modes[mode].push(r)
  appendFileSync(join(ART, 'shutdown-probe.jsonl'), JSON.stringify({ mode: mode, ...r }) + '\n')
  console.log(mode, JSON.stringify(r))
}

const N = Number(process.argv[2] ?? 5)

// --- A: serial, no reader -------------------------------------------------
for (let i = 0; i < N; i++) {
  const dir = freshDir(`a${i}`)
  const app = await launch(dir)
  // wait until the app has actually done work (seed + window)
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('load', { timeout: 60_000 })
  await page.waitForTimeout(500)
  record('A-serial-noreader', await closeOnce(app, null))
}

// --- B: serial, independent reader held open ------------------------------
for (let i = 0; i < N; i++) {
  const dir = freshDir(`b${i}`)
  const app = await launch(dir)
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('load', { timeout: 60_000 })
  await page.waitForTimeout(500)
  record('B-serial-dbreader-open', await closeOnce(app, dir))
}

// --- C: two instances, closed concurrently --------------------------------
for (let i = 0; i < N; i++) {
  const d1 = freshDir(`c${i}a`)
  const d2 = freshDir(`c${i}b`)
  const [app1, app2] = await Promise.all([launch(d1), launch(d2)])
  const [p1, p2] = await Promise.all([
    app1.firstWindow({ timeout: 60_000 }),
    app2.firstWindow({ timeout: 60_000 })
  ])
  await Promise.all([
    p1.waitForLoadState('load', { timeout: 60_000 }),
    p2.waitForLoadState('load', { timeout: 60_000 })
  ])
  await new Promise((r) => setTimeout(r, 500))
  const [r1, r2] = await Promise.all([closeOnce(app1, null), closeOnce(app2, null)])
  record('C-parallel-1', r1)
  record('C-parallel-2', r2)
}

results.finishedAt = new Date().toISOString()
writeFileSync(join(ART, 'shutdown-probe.json'), JSON.stringify(results, null, 2))
console.log('written', join(ART, 'shutdown-probe.json'))

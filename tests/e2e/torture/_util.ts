import { _electron as electron, type Page, type ElectronApplication } from '@playwright/test'
import { rmSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Live-torture harness utilities.
 *
 * Everything here launches or observes the REAL application:
 *  - real Electron main + renderer + preload processes
 *  - real SQLite database owned by the app (opened independently here with
 *    node:sqlite for UI <-> DB triangulation — never used to hide a defect)
 *  - artifact logging under artifacts/live-torture/<run>/
 */

export const RUN = process.env.APEX_TORTURE_RUN ?? 'run-20260926-1415'
export const ART = join('artifacts', 'live-torture', RUN)
export const TORTURE_TMP = '/tmp/opencode/apex-torture'

export const PIN = '1234'
export const USERS: Record<string, string> & {
  owner: string
  admin: string
  manager: string
  cashier: string
  waiter: string
  kitchen: string
  inventory: string
  purchasing: string
  accountant: string
  auditor: string
} = {
  owner: 'Owner123!',
  admin: 'Admin123!',
  manager: 'Manager123!',
  cashier: 'Cashier123!',
  waiter: 'Waiter123!',
  kitchen: 'Kitchen123!',
  inventory: 'Inventory123!',
  purchasing: 'Purchase123!',
  accountant: 'Account123!',
  auditor: 'Audit123!'
}

let seq = 0

/** Fresh disposable data dir (never production data). */
export const freshDir = (label: string): string => {
  const dir = join(TORTURE_TMP, `${label}-${process.pid}-${seq++}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface LaunchOpts {
  label: string
  /** Share an existing data dir (multi-instance / shared-DB races). */
  dir?: string
  /** Seed the full demo store (default true). false => onboarding wizard. */
  seed?: boolean
  extraArgs?: string[]
}

/** Launch a REAL Electron instance of the built app. */
export const launchT = async (
  opts: LaunchOpts
): Promise<{ app: ElectronApplication; dir: string }> => {
  const dir = opts.dir ?? freshDir(opts.label)
  const t0 = Date.now()
  const app = await electron.launch({
    timeout: 60_000,
    args: [
      '.',
      `--user-data-dir=${join(dir, `ud-${process.pid}-${seq++}`)}`,
      ...(opts.extraArgs ?? [])
    ],
    env: {
      ...process.env,
      APEXPOS_DATA_DIR: dir,
      NODE_ENV: 'development',
      APEXPOS_SEED_DEMO: opts.seed === false ? '0' : '1'
    }
  })
  log({ stage: 'launchT', label: opts.label, ms: Date.now() - t0 })
  return { app, dir }
}

export const firstWindow = async (app: ElectronApplication): Promise<Page> => {
  const t0 = Date.now()
  const page = await app.firstWindow({ timeout: 60_000 })
  // Playwright's action timeout defaults to 0 (wait forever). An app that is
  // slow to paint its login form would otherwise hang `page.fill()` with no
  // diagnostic and burn the whole test budget anonymously. Bound everything.
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(30_000)
  await page.waitForLoadState('load', { timeout: 60_000 })
  log({ stage: 'firstWindow', ms: Date.now() - t0 })
  return page
}

/**
 * Log in through the real login screen. Waits for the app shell.
 * Each stage is logged so a test-level timeout points at the hanging step
 * instead of surfacing as an anonymous "Test timeout of 240000ms exceeded".
 */
export const login = async (
  app: ElectronApplication,
  username: keyof typeof USERS | string,
  password?: string
): Promise<Page> => {
  const t0 = Date.now()
  const page = await firstWindow(app)
  await page.fill('#username', username)
  await page.fill('#password', password ?? USERS[username] ?? '')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=Current Sale', { timeout: 20_000 })
  log({ stage: 'login', username, ms: Date.now() - t0 })
  return page
}

/** Log in but only wait for the error/next state (bad-credential paths). */
export const attemptLogin = async (
  app: ElectronApplication,
  username: string,
  password: string
): Promise<Page> => {
  const page = await firstWindow(app)
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  return page
}

// ---------------------------------------------------------------------------
// Independent database verification (node:sqlite; the app uses better-sqlite3
// — a genuinely independent reader, not the app's own connection).
// ---------------------------------------------------------------------------

export type Db = DatabaseSync

export const openDb = (dir: string): Db => {
  const db = new DatabaseSync(join(dir, 'apexpos.db'))
  db.exec('PRAGMA busy_timeout = 8000')
  return db
}

export const q = <T>(db: Db, sql: string, ...params: string[] | number[]): T[] =>
  db.prepare(sql).all(...params) as T[]
export const q1 = <T>(db: Db, sql: string, ...params: string[] | number[]): T =>
  db.prepare(sql).get(...params) as T

/** Integrity + FK invariants; returns [integrity, fkViolations]. */
export const dbHealth = (db: Db): { integrity: string; fk: unknown[] } => ({
  integrity: q1<{ integrity_check: string }>(db, 'PRAGMA integrity_check').integrity_check,
  fk: q(db, 'PRAGMA foreign_key_check')
})

// ---------------------------------------------------------------------------
// Artifact logging
// ---------------------------------------------------------------------------

const ensure = (sub: string): string => {
  const p = join(ART, sub)
  mkdirSync(p, { recursive: true })
  return p
}

export const log = (event: Record<string, unknown>): void => {
  ensure('.')
  appendFileSync(
    join(ART, 'events.jsonl'),
    JSON.stringify({ ...event, t: new Date().toISOString() }) + '\n'
  )
}

/** Record a candidate defect (triaged later against evidence). */
export const defect = (d: {
  id: string
  severity: string
  feature: string
  observed: string
  expected: string
  evidence?: string
}): void => {
  const p = ensure('defects')
  appendFileSync(
    join(p, 'defects.jsonl'),
    JSON.stringify({ ...d, t: new Date().toISOString() }) + '\n'
  )
}

export const shot = async (page: Page, name: string): Promise<string> => {
  const p = ensure('screenshots')
  const file = join(p, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}

export const perf = (metric: Record<string, unknown>): void => {
  const p = ensure('performance')
  appendFileSync(join(p, 'perf.jsonl'), JSON.stringify({ ...metric, t: Date.now() }) + '\n')
}

// ---------------------------------------------------------------------------
// App helpers
// ---------------------------------------------------------------------------

/** Grep-free product pick: search + click by product name in the live grid. */
export const addProduct = async (page: Page, name: string): Promise<void> => {
  await page.fill('input[aria-label="Search products"]', name)
  await page.waitForSelector(`button:has-text("${name}")`, { timeout: 10_000 })
  await page.click(`button:has-text("${name}")`)
}

/**
 * Focus the POS search box before sending raw keystrokes.
 *
 * PosScreen autofocuses in a mount `useEffect`, which React flushes *after*
 * paint. Playwright can observe `text=Current Sale` before that effect runs,
 * so `page.keyboard.type()` would land on `<body>` and silently add nothing.
 * The barcode specs are about "digits + Enter into the FOCUSED search box",
 * so make that premise explicit rather than racing it.
 */
export const focusSearch = async (page: Page): Promise<void> => {
  await page.locator('input[aria-label="Search products"]').click()
}

// ---------------------------------------------------------------------------
// Restaurant floor plan
// ---------------------------------------------------------------------------
// The floor canvas is absolutely positioned (not a `.grid`), each tile exposes
// `aria-label="Table <name>, <status>"`, and there is NO open-table dialog:
// clicking a free tile opens a side detail panel with ±guests controls and a
// "Seat party of N" button that navigates to `/pos?order=<id>`.

/** Select a table tile by its name (status lives in the same aria-label). */
export const tableBtn = (page: Page, name: string) =>
  page.locator(`button[aria-label^="Table ${name},"]`).first()

/** Go to the floor plan and wait until the table tiles have rendered. */
export const gotoFloor = async (page: Page): Promise<void> => {
  await page.click('a[href="#/floor"]')
  await page.waitForFunction(
    () => document.querySelectorAll('button[aria-label^="Table "]').length > 0,
    undefined,
    { timeout: 30_000 }
  )
}

/** Live aria-label of a table tile, e.g. `Table T-1, free`. */
export const tableAria = async (page: Page, name: string): Promise<string> => {
  await gotoFloor(page)
  return (await tableBtn(page, name).getAttribute('aria-label')) ?? ''
}

export const isFreeAria = (aria: string): boolean => aria.endsWith(', free')

/**
 * Poll a table tile until its status satisfies `pred`. The floor refreshes on
 * a 5s interval, so assertions after a raw `window.api.*` mutation must wait
 * for the next tick instead of reading the stale tile.
 */
export const waitForTableAria = async (
  page: Page,
  name: string,
  pred: (aria: string) => boolean,
  timeout = 15_000
): Promise<string> => {
  const end = Date.now() + timeout
  let last = ''
  do {
    last = await tableAria(page, name)
    if (pred(last)) return last
    await page.waitForTimeout(400)
  } while (Date.now() < end)
  return last
}

/** Seat a FREE table through the real detail panel; lands on `/pos?order=<id>`. */
export const seatTable = async (page: Page, name: string, guests = 2): Promise<void> => {
  await gotoFloor(page)
  await tableBtn(page, name).click()
  // The panel starts at 2 and the count is sticky across selections, so drive
  // it deterministically: floor at 1, then step up (capacity clamps the rest).
  for (let i = 0; i < 8; i++) await page.click('button[aria-label="Fewer guests"]')
  for (let i = 1; i < guests; i++) await page.click('button[aria-label="More guests"]')
  await page.click('button:has-text("Seat party of")')
  await page.waitForSelector('text=table order', { timeout: 20_000 })
}

/** Open an OCCUPIED table's active order into the POS. */
export const openTableOrder = async (page: Page, name: string): Promise<void> => {
  await gotoFloor(page)
  await tableBtn(page, name).click()
  await page.click('button:has-text("View / add to order")')
  await page.waitForSelector('text=table order', { timeout: 20_000 })
}

/**
 * Persist the cart onto the table's order (cart lines are renderer-only until
 * written) and fire it to the kitchen. Both are required before any DB check
 * on `order_lines`.
 */
export const sendToKitchen = async (page: Page): Promise<void> => {
  await page.click('button:has-text("Send to kitchen")')
  await page.waitForSelector('text=Sent to kitchen', { timeout: 20_000 })
}

/** Ids of every seeded table, keyed by name. */
export const tableIds = (page: Page): Promise<Record<string, string>> =>
  page.evaluate<Record<string, string>>(`window.api.floors.tables().then(r =>
    Object.fromEntries(r.data.map(t => [t.name, t.id])))`)

/**
 * Assert an optional lookup resolved. Turns `string | undefined` into a hard,
 * named failure instead of letting `undefined` reach SQL or the DOM.
 */
export const need = <T>(value: T | undefined, what: string): T => {
  if (value === undefined || value === null) throw new Error(`missing ${what}`)
  return value
}

/**
 * Resolve a table name to its id, failing loudly when the floor omits it.
 * (`Record` indexing yields `string | undefined`; never let that reach SQL.)
 */
export const idOf = (ids: Record<string, string>, name: string): string => {
  const id = ids[name]
  if (!id) throw new Error(`table ${name} was not returned by the floor plan`)
  return id
}

/** Table name → active order id (only tables that currently have one). */
export const activeOrders = (page: Page): Promise<Record<string, string>> =>
  page.evaluate<Record<string, string>>(`window.api.floors.tables().then(r =>
    Object.fromEntries(r.data.filter(t => t.activeOrderId).map(t => [t.name, t.activeOrderId])))`)

/** Complete a cash sale through the real UI and return the receipt text. */
export const payCash = async (page: Page): Promise<string> => {
  await page.click('button:has-text("Charge")')
  await page.waitForSelector('text=Payment complete', { timeout: 15_000 })
  return (await page.locator('div.font-mono').innerText()) ?? ''
}

/** Run a call against the REAL preload boundary (compromised-renderer path). */
export const api = (page: Page, expr: string): Promise<unknown> =>
  page.evaluate(`window.api && (${expr})`)

/** All distinct completed retail orders for a branch, straight from SQL. */
export const completedOrders = (db: Db) =>
  q<{ id: string; number: number; total: number; user_id: string; status: string }>(
    db,
    `SELECT id, number, total, user_id, status FROM orders WHERE status = 'completed' ORDER BY created_at`
  )

/**
 * Close the app, bounded.
 *
 * `ElectronApplication.close()` exposes NO timeout, so a quit that hangs used
 * to swallow the entire 240s test budget and surface as an anonymous
 * "Test timeout exceeded". Bound it here and leave evidence in events.jsonl
 * so a real shutdown hang is visible instead of being absorbed silently.
 */
export const closeApp = async (app: ElectronApplication): Promise<void> => {
  const t0 = Date.now()
  try {
    const proc = app.process()
    if (!proc || proc.exitCode !== null) {
      log({ stage: 'closeApp', ms: Date.now() - t0, state: 'already-exited' })
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      app.close().then(
        () => 'closed' as const,
        (e: unknown) => {
          log({ stage: 'closeApp', ms: Date.now() - t0, closeErr: String(e) })
          return 'closed' as const
        }
      ),
      new Promise<'hung'>((resolve) => {
        timer = setTimeout(() => resolve('hung'), 30_000)
      })
    ])
    if (timer) clearTimeout(timer)
    if (outcome === 'hung') {
      log({ stage: 'closeApp', ms: Date.now() - t0, hung: true, exitCode: proc.exitCode })
      proc.kill('SIGKILL')
      return
    }
    log({ stage: 'closeApp', ms: Date.now() - t0, state: 'closed' })
  } catch (e) {
    log({ stage: 'closeApp', ms: Date.now() - t0, err: String(e) })
  }
}

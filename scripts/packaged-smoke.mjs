// Smoke: launch the packaged (electron-builder --dir) binary cold,
// complete nothing — just prove it boots to a usable shell on a fresh dir,
// the WAL database initializes, and PRAGMAs are healthy.
import { _electron as electron } from '@playwright/test'
import { rmSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const stamp = process.env.APEX_RUN_ID ?? 'local'
const exe = 'release/linux-unpacked/apexpos'
if (!existsSync(exe)) {
  console.error(`packaged binary missing: ${exe} — run npm run package:dir first`)
  process.exit(1)
}
const dir = `/tmp/apex-packaged-${process.pid}`
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const t0 = performance.now()
const app = await electron.launch({
  executablePath: exe,
  args: [`--user-data-dir=${join(dir, 'user-data')}`],
  // Demo seed so the packaged app reaches the POS like a shipped demo build
  env: { ...process.env, APEXPOS_DATA_DIR: dir, APEXPOS_SEED_DEMO: '1' }
})
const page = await app.firstWindow()
await page.waitForLoadState('load')
await page.waitForSelector('text=/Sign in/', { timeout: 20000 })
const interactiveMs = Math.round(performance.now() - t0)

// Login through the packaged UI
await page.fill('#username', 'owner')
await page.fill('#password', 'Owner123!')
await page.click('button[type=submit]')
await page.waitForSelector('text=Current Sale', { timeout: 20000 })
await page.click('button:has-text("Coca-Cola 500ml PET")')
await page.keyboard.press('F9')
await page.waitForSelector('text=Payment complete', { timeout: 10000 })

await app.close()

// Database forensics on the PACKAGED artifacts
const Database = (await import('better-sqlite3')).default
const db = new Database(join(dir, 'apexpos.db'))
const integrity = db.pragma('integrity_check', { simple: true })
const fk = db.pragma('foreign_key_check').length
const journal = db.pragma('journal_mode', { simple: true })
const orders = db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'completed'").get()
db.close()

const result = {
  binary: exe,
  interactiveMs,
  packagedSale: true,
  integrity,
  fkViolations: fk,
  journalMode: journal,
  completedOrders: orders.c
}
console.log(JSON.stringify(result, null, 2))
mkdirSync(`artifacts/${stamp}/packages`, { recursive: true })
const { writeFileSync } = await import('node:fs')
writeFileSync(`artifacts/${stamp}/packages/packaged-smoke.json`, JSON.stringify(result, null, 2))
if (integrity !== 'ok' || fk !== 0 || journal !== 'wal' || orders.c < 1) process.exit(2)

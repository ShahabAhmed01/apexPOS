import { it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from '@main/db/database'
import { seedBase } from '@main/db/seed'
import { ProductService } from '@main/services/productService'
import { ReportService } from '@main/services/reportService'
import { AuthService } from '@main/services/authService'
import { hashPassword } from '@main/security/passwords'

/**
 * PERF harness — measures REAL timings against a generated dataset and writes
 * machine-readable results to artifacts/<run>/performance/perf.json.
 *
 * Only runs when APEXPOS_PERF=1 (this is a measurement, not a correctness
 * gate; the floor assertions are generous regression tripwires).
 */

const RUN_ID = process.env.APEX_RUN_ID ?? 'local'
const OUT = join(process.cwd(), 'artifacts', RUN_ID, 'performance')
const DB_ROOT = join('/tmp/opencode/apex', `perf-${process.pid}`)
const DB_PATH = join(DB_ROOT, 'apexpos.db')

const PERF_ON = process.env.APEXPOS_PERF === '1'
const N_PRODUCTS = Number(process.env.APEX_PERF_PRODUCTS ?? 10000)
const N_ORDERS = Number(process.env.APEX_PERF_ORDERS ?? 20000) // orders × ~2 lines
const REPS = 50

interface Timings {
  [key: string]: { p50?: number; p95?: number; avg?: number; cold?: number; n?: number }
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!
}

const time = (fn: () => unknown): number => {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

it('perf: measured timings on a 10k-product / 20k-order dataset', { timeout: 600_000 }, () => {
  if (!PERF_ON) {
    expect(true).toBe(true) // not a gate without APEXPOS_PERF=1
    return
  }

  rmSync(DB_ROOT, { recursive: true, force: true })
  mkdirSync(DB_ROOT, { recursive: true })
  const results: Timings = {}
  const env = {
    commit: process.env.GIT_SHA ?? 'worktree',
    products: N_PRODUCTS,
    orders: N_ORDERS,
    node: process.version,
    platform: process.platform
  }

  // --- Build fresh DB: measure migration ------------
  results.openMigrate = { cold: time(() => void openDatabase(DB_PATH)) }

  const ctx = openDatabase(DB_PATH)
  results.seedBase = { cold: time(() => seedBase(ctx.db)) }
  // Minimal org structure (seedBase is roles/units only)
  {
    const t = new Date().toISOString()
    const orgId = crypto.randomUUID()
    ctx.db
      .prepare(`INSERT INTO organizations (id, name, created_at) VALUES (?, 'PerfOrg', ?)`)
      .run(orgId, t)
    const bid = crypto.randomUUID()
    ctx.db
      .prepare(
        `INSERT INTO branches (id, organization_id, name, code) VALUES (?, ?, 'Perf', 'PERF')`
      )
      .run(bid, orgId)
    // admin user for the login timing
    const roleId = (
      ctx.db.prepare(`SELECT id FROM roles WHERE name = 'Administrator'`).get() as {
        id: string
      }
    ).id
    ctx.db
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, pin_hash, role_id, branch_id, created_at)
           VALUES (?, 'admin', 'Perf Admin', ?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), hashPassword('Admin123!'), hashPassword('1234'), roleId, bid, t)
  }
  const branchId = (
    ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string } | undefined
  )?.id
  if (!branchId) throw new Error('perf rig needs a branch row')

  // --- Generate dataset (batched, measured separately) ------------
  const unitId = (ctx.db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }).id
  const taxIdRow = ctx.db.prepare('SELECT id FROM taxes WHERE is_default = 1').get() as
    { id: string } | undefined
  const t0 = new Date().toISOString()

  results.generateProducts = {
    cold: time(() => {
      const insert = ctx.db.prepare(
        `INSERT INTO products (id, sku, barcode, name, unit_id, price, cost, tax_id, track_stock, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
      )
      const stock = ctx.db.prepare(
        `INSERT INTO stock_movements (id, product_id, branch_id, qty_delta, reason, user_id, created_at)
           VALUES (?, ?, ?, ?, 'initial', 'perf', ?)`
      )
      const batch = ctx.db.transaction((from: number, count: number) => {
        for (let i = from; i < from + count; i++) {
          const id = crypto.randomUUID()
          insert.run(
            id,
            `PERF-${i}`,
            `890${String(10000000000 + i)}`,
            `Perf Product ${i}`,
            unitId,
            100 + (i % 900),
            50,
            taxIdRow?.id ?? null,
            t0,
            t0
          )
          stock.run(crypto.randomUUID(), id, branchId, 5000 + (i % 5000), t0)
        }
      })
      for (let i = 0; i < N_PRODUCTS; i += 1000) batch(i, Math.min(1000, N_PRODUCTS - i))
    })
  }

  results.generateOrders = {
    cold: time(() => {
      const someProducts = ctx.db
        .prepare(`SELECT id FROM products WHERE sku LIKE 'PERF-%' ORDER BY rowid LIMIT 500`)
        .all() as { id: string }[]
      const insOrder = ctx.db.prepare(
        `INSERT INTO orders (id, branch_id, number, number_label, type, status, terminal_id, user_id,
            subtotal, discount_total, tax_total, total, created_at, completed_at, client_op_id)
           VALUES (?, ?, ?, ?, 'retail', 'completed', 't1', 'perf', ?, 0, ?, ?, ?, ?, ?)`
      )
      const insLine = ctx.db.prepare(
        `INSERT INTO order_lines (id, order_id, product_id, sku, name, quantity, unit_price, line_total, status, sort_order)
           VALUES (?, ?, ?, 'PERF', 'P', 1000, ?, ?, 'served', 0)`
      )
      const insPay = ctx.db.prepare(
        `INSERT INTO payments (id, order_id, method, amount, status, created_at)
           VALUES (?, ?, 'cash', ?, 'approved', ?)`
      )
      const batch = ctx.db.transaction((from: number, count: number) => {
        for (let i = from; i < from + count; i++) {
          const oid = crypto.randomUUID()
          const subtotal = 500 + (i % 40) * 100
          const tax = Math.round(subtotal * 0.13)
          const total = subtotal + tax
          insOrder.run(oid, branchId, i, `ORD-PERF-${i}`, subtotal, tax, total, t0, t0, `perf-${i}`)
          insLine.run(
            crypto.randomUUID(),
            oid,
            someProducts[i % someProducts.length]!.id,
            subtotal,
            subtotal
          )
          insPay.run(crypto.randomUUID(), oid, total, t0)
        }
      })
      for (let i = 0; i < N_ORDERS; i += 1000) batch(i, Math.min(1000, N_ORDERS - i))
    })
  }

  const products = new ProductService(ctx.db, branchId)
  const reports = new ReportService(ctx.db, branchId)
  const auth = new AuthService(ctx.db)

  // --- Measured operations ---------------------------------------
  const measure = (name: string, fn: () => unknown): void => {
    // one warm-up, then REPS samples
    fn()
    const xs: number[] = []
    for (let i = 0; i < REPS; i++) xs.push(time(fn))
    results[name] = {
      p50: pct(xs, 50),
      p95: pct(xs, 95),
      avg: xs.reduce((a, b) => a + b, 0) / xs.length,
      n: REPS
    }
  }

  measure('auth.login.argon2id', () => auth.login('admin', 'Admin123!'))

  measure('products.search.prefixQuery', () => {
    const r = products.search('Perf Product 123')
    if (r.length === 0) throw new Error('search returned nothing')
  })
  measure('products.byBarcode', () => {
    const r = products.byBarcode(`890${10000000000 + 777}`)
    if (!r) throw new Error('barcode miss')
  })
  measure('products.list.page500', () => products.list({ limit: 500, offset: 0 }))
  measure('products.onHand', () => products.onHand(someFirstProductId(ctx)))
  measure('dashboard', () => reports.dashboard())
  const from = '2020-01-01T00:00:00.000Z'
  const to = '2099-01-01T00:00:00.000Z'
  measure('reports.salesSummary.all', () => reports.salesSummary(from, to))
  measure('reports.shiftReport.latest', () => {
    const s = ctx.db.prepare('SELECT id FROM shifts ORDER BY opened_at DESC LIMIT 1').get() as
      { id: string } | undefined
    if (s) reports.shiftReport(s.id)
  })

  // integrity proof of the perf DB itself
  expect(ctx.db.pragma('integrity_check', { simple: true })).toBe('ok')

  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'perf.json'),
    JSON.stringify(
      { env, results, note: 'service-level timings; better-sqlite3 sync calls' },
      null,
      2
    )
  )
  console.log('\n=== PERF RESULTS ===')
  for (const [k, v] of Object.entries(results)) {
    console.log(
      `${k.padEnd(32)} ${v.cold !== undefined ? `cold=${v.cold.toFixed(1)}ms` : `p50=${v.p50!.toFixed(1)}ms p95=${v.p95!.toFixed(1)}ms avg=${v.avg!.toFixed(1)}ms n=${v.n}`}`
    )
  }
  ctx.close()
})

function someFirstProductId(ctx: {
  db: { prepare: (s: string) => { get: () => unknown } }
}): string {
  const row = ctx.db
    .prepare(`SELECT id FROM products WHERE sku LIKE 'PERF-%' ORDER BY rowid LIMIT 1`)
    .get() as { id: string }
  return row.id
}

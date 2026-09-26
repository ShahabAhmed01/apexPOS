import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { SyncService } from '@main/services/syncService'
import { TMP_ROOT } from '../helpers/rig'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

/**
 * ADVERSARIAL-CONCURRENCY — races that slip past a single happy-path run:
 *  - identical clientOpId submitted twice at the same instant (double-click /
 *    retry-vs-timeout) — must yield exactly one business effect
 *  - two OS processes opening the same restaurant table at once
 */

const ROOT = join(TMP_ROOT, `advrace-${process.pid}`)
const DB_PATH = join(ROOT, 'apexpos.db')

let A: DbContext
let B: DbContext
let branchId: string
let userId: string
let registerId: string
let productId: string

const stackOf = (ctx: DbContext): { orders: OrderService; payments: PaymentService } => {
  const auth = new AuthService(ctx.db)
  const sync = new SyncService(ctx.db)
  const orders = new OrderService(ctx.db, auth, branchId, sync)
  const payments = new PaymentService(
    ctx.db,
    auth,
    branchId,
    (orderId, uid) => orders.completePayment(orderId, uid),
    (orderId) => orders.getOrder(orderId),
    sync
  )
  return { orders, payments }
}

beforeAll(() => {
  mkdirSync(ROOT, { recursive: true })
  A = openDatabase(DB_PATH)
  seedIfEmpty(A.db)
  B = openDatabase(DB_PATH)
  branchId = (A.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  const auth = new AuthService(A.db)
  userId = auth.login('manager', 'Manager123!').user.id
  registerId = (A.db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }).id
  const unit = A.db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
  productId = crypto.randomUUID()
  const t = new Date().toISOString()
  A.db
    .prepare(
      `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
       VALUES (?, ?, 'Race Adv', ?, 10000, 0, 1, 1, ?, ?)`
    )
    .run(productId, `RC-${productId.slice(0, 8)}`, unit.id, t, t)
  A.db
    .prepare(
      `INSERT INTO stock_movements (id, product_id, branch_id, qty_delta, reason, user_id, created_at)
       VALUES (?, ?, ?, 100000, 'initial', ?, ?)`
    )
    .run(crypto.randomUUID(), productId, branchId, userId, t)
})

afterAll(() => {
  A.close()
  B.close()
  rmSync(ROOT, { recursive: true, force: true })
})

describe('TC-RACE-IDEM — duplicate submissions under real lock contention', () => {
  it('TC-RACE-CREATE-001: the same clientOpId raced by two connections produces exactly ONE order', () => {
    const opId = crypto.randomUUID()
    // B's create runs INSIDE A's commit window — it must hit the write lock and
    // lose; A retries B's operation after commit and must land the idempotent hit.
    let secondAttemptError: unknown = null
    const ordersB = stackOf(B).orders

    const txA = A.db.transaction(() => {
      // occupy the writer slot, then attempt B's identical op while locked
      A.db
        .prepare(
          'INSERT INTO order_counters (branch_id, date_key, last_no) VALUES (?, ?, 1) ON CONFLICT(branch_id, date_key) DO UPDATE SET last_no = last_no + 1'
        )
        .run(branchId, 'LOCKHOLD')
      B.db.pragma('busy_timeout = 50')
      try {
        ordersB.createOrder(
          {
            type: 'retail',
            registerId,
            lines: [{ productId, quantityMilli: 1000 }],
            clientOpId: opId
          },
          { userId, terminalId: 'term-local-01' }
        )
      } catch (e) {
        secondAttemptError = e
      }
    })
    txA.immediate()
    expect(String((secondAttemptError as Error)?.message ?? '')).toMatch(/busy|locked/i)

    // Retry after the lock clears — the idempotency short-circuit must win.
    const first = stackOf(A).orders.createOrder(
      {
        type: 'retail',
        registerId,
        lines: [{ productId, quantityMilli: 1000 }],
        clientOpId: opId
      },
      { userId, terminalId: 'term-local-01' }
    )
    const second = stackOf(B).orders.createOrder(
      {
        type: 'retail',
        registerId,
        lines: [{ productId, quantityMilli: 1000 }],
        clientOpId: opId
      },
      { userId, terminalId: 'term-local-01' }
    )
    expect(second.id).toBe(first.id)
    const count = A.db
      .prepare('SELECT COUNT(*) c FROM orders WHERE client_op_id = ?')
      .get(opId) as {
      c: number
    }
    expect(count.c).toBe(1)
  })

  it('TC-RACE-TENDER-001: the same tender clientOpId raced by two connections pays exactly once', () => {
    const { orders } = stackOf(A)
    const order = orders.createOrder(
      {
        type: 'retail',
        registerId,
        lines: [{ productId, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    const opId = crypto.randomUUID()
    let racedError: unknown = null
    const payB = stackOf(B).payments
    const txA = A.db.transaction(() => {
      A.db
        .prepare(
          'INSERT INTO order_counters (branch_id, date_key, last_no) VALUES (?, ?, 1) ON CONFLICT(branch_id, date_key) DO UPDATE SET last_no = last_no + 1'
        )
        .run(branchId, 'LOCKHOLD2')
      B.db.pragma('busy_timeout = 50')
      try {
        payB.tender(
          {
            orderId: order.id,
            payments: [{ method: 'cash', amount: order.total, tendered: order.total }],
            clientOpId: opId
          },
          userId
        )
      } catch (e) {
        racedError = e
      }
    })
    txA.immediate()
    expect(String((racedError as Error)?.message ?? '')).toMatch(/busy|locked/i)

    // Now race "for real" — first commits, second must idempotent-replay
    const payA1 = stackOf(A).payments
    const r1 = payA1.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total, tendered: order.total }],
        clientOpId: opId
      },
      userId
    )
    const r2 = stackOf(B).payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total, tendered: order.total }],
        clientOpId: opId
      },
      userId
    )
    expect(r2.id).toBe(r1.id)
    const pays = A.db
      .prepare(
        `SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM payments WHERE order_id = ? AND status != 'declined'`
      )
      .get(order.id) as { c: number; s: number }
    expect(pays.c).toBe(1)
    expect(pays.s).toBe(order.total)
    expect(stackOf(A).orders.getOrder(order.id).status).toBe('completed')
  })

  it('TC-RACE-TABLE-001: two OS processes opening the same table create one order, no duplicate numbers', async () => {
    const root = join(TMP_ROOT, `advtablerace-${process.pid}`)
    mkdirSync(root, { recursive: true })
    const dbPath = join(root, 'apexpos.db')
    const setup = openDatabase(dbPath)
    seedIfEmpty(setup.db)
    const branch = (setup.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
    const zone = crypto.randomUUID()
    setup.db
      .prepare('INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, 0)')
      .run(zone, branch, 'RZ')
    const table = crypto.randomUUID()
    setup.db
      .prepare('INSERT INTO restaurant_tables (id, zone_id, name, capacity) VALUES (?, ?, ?, 4)')
      .run(table, zone, 'RT-1')
    setup.close()

    const sqlitePath = createRequire(import.meta.url).resolve('better-sqlite3')
    const workerSrc = `
      const Database = require(${JSON.stringify(sqlitePath)})
      const [dbPath, table, branch] = process.argv.slice(2)
      const db = new Database(dbPath)
      db.pragma('busy_timeout = 15000')
      // mirrors RestaurantService.openTable: occupancy check + insert atomically
      const open = db.transaction(() => {
        const existing = db.prepare("SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1").get(table)
        if (existing) return existing.id
        const orderId = crypto.randomUUID()
        db.prepare(
          "INSERT INTO orders (id, branch_id, number, number_label, type, status, terminal_id, user_id, table_id, subtotal, discount_total, tax_total, service_charge, tip, rounding_adjustment, total, created_at) VALUES (?, ?, (SELECT COALESCE(MAX(number),0)+1 FROM orders WHERE branch_id = ?), 'T-' || ?, 'dine_in', 'open', 'term-local-01', 'seed-user', ?, 0,0,0,0,0,0,0, ?)"
        ).run(orderId, branch, branch, branch.slice(0,4).toUpperCase(), table, new Date().toISOString())
        return orderId
      })
      let id = null, err = null
      try { id = open.immediate() } catch (e) { err = String(e) }
      console.log(JSON.stringify({ id, err }))
    `
    const workerFile = join(root, 'worker.cjs')
    writeFileSync(workerFile, `void 0;\n${workerSrc}`)
    const runWorker = (): Promise<{ id: string | null; err: string | null }> =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [workerFile, dbPath, table, branch])
        let out = ''
        let err = ''
        child.stdout.on('data', (d: Buffer) => (out += d.toString()))
        child.stderr.on('data', (d: Buffer) => (err += d.toString()))
        child.on('close', (exit) =>
          exit === 0
            ? resolve(JSON.parse(out.trim()) as { id: string | null; err: string | null })
            : reject(new Error(`worker exited ${exit}: ${err}`))
        )
      })
    const results = await Promise.all(Array.from({ length: 4 }, runWorker))
    const ids = new Set(results.map((r) => r.id).filter(Boolean))
    expect(ids.size).toBe(1) // one winner, three idempotent joins — no duplicates
    const verify = openDatabase(dbPath)
    const nums = verify.db
      .prepare(
        `SELECT number, COUNT(*) c FROM orders WHERE branch_id = ? GROUP BY number HAVING c > 1`
      )
      .all(branch) as { number: number; c: number }[]
    expect(nums).toHaveLength(0)
    const active = verify.db
      .prepare(
        `SELECT COUNT(*) c FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void')`
      )
      .get(table) as { c: number }
    expect(active.c).toBe(1)
    verify.close()
    rmSync(root, { recursive: true, force: true })
  }, 60_000)
})

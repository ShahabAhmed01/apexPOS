import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { PurchaseService } from '@main/services/purchaseService'
import { RegisterService } from '@main/services/registerService'
import { CustomerService } from '@main/services/customerService'
import { SyncService } from '@main/services/syncService'
import { TMP_ROOT } from '../helpers/rig'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

/**
 * RACE suite — genuine concurrent access.
 *
 * Two mechanisms, both honest about what they prove:
 *
 *  A) Two better-sqlite3 connections on one file DB. Critical sections are
 *     interleaved deterministically: connection A's commit-time fault hook
 *     runs connection B's competing operation while A holds the write lock.
 *     B must lose cleanly (SQLite lock contention) and the loser retrying
 *     afterwards must be rejected by the business invariant — no oversell,
 *     no double-spend, no double refund, no lost movement.
 *
 *  B) True multi-process races: N OS processes hammer the same gift card
 *     through guarded transactions. Proves the DB-level invariant holds
 *     under uncontrolled interleaving.
 */

const USER = 'seed-user'
const PIN = '1234'
const ROOT = join(TMP_ROOT, `race-${process.pid}`)
const DB_PATH = join(ROOT, 'apexpos.db')

let A: DbContext
let B: DbContext
let branchId: string

// IMPORTANT: each terminal gets its own full service stack bound to its own
// connection (an AuthService bound to A must never write inside a B
// transaction — that is precisely the cross-connection bug this suite
// guards against).
interface Stack {
  orders: OrderService
  payments: (hooks?: { beforeCommit?: (label: string) => void }) => PaymentService
  purchasing: PurchaseService
  registers: RegisterService
  customers: CustomerService
}

const stacks = new Map<DbContext, Stack>()
const stackOf = (ctx: DbContext): Stack => {
  let s = stacks.get(ctx)
  if (!s) {
    const auth = new AuthService(ctx.db)
    const sync = new SyncService(ctx.db)
    const orders = new OrderService(ctx.db, auth, branchId, sync)
    s = {
      orders,
      payments: (hooks) =>
        new PaymentService(
          ctx.db,
          auth,
          branchId,
          (orderId, userId) => orders.completePayment(orderId, userId),
          (orderId) => orders.getOrder(orderId),
          sync,
          hooks
        ),
      purchasing: new PurchaseService(ctx.db, auth, branchId, undefined, sync),
      registers: new RegisterService(ctx.db, auth, branchId),
      customers: new CustomerService(ctx.db)
    }
    stacks.set(ctx, s)
  }
  return s
}

/** A tracked product with an exact, test-controlled on-hand quantity. */
const mkTrackedProduct = (stockMilli: number, price = 15000): string => {
  const unit = A.db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
  const id = crypto.randomUUID()
  const t = new Date().toISOString()
  A.db
    .prepare(
      `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, 1, ?, ?)`
    )
    .run(id, `R-${id.slice(0, 8)}`, 'Race product', unit.id, price, t, t)
  A.db
    .prepare(
      `INSERT INTO stock_movements (id, product_id, branch_id, qty_delta, reason, user_id, created_at)
       VALUES (?, ?, ?, ?, 'initial', ?, ?)`
    )
    .run(crypto.randomUUID(), id, branchId, stockMilli, USER, t)
  return id
}

const onHand = (productId: string): number =>
  (
    A.db
      .prepare(
        'SELECT COALESCE(SUM(qty_delta),0) q FROM stock_movements WHERE product_id = ? AND branch_id = ?'
      )
      .get(productId, branchId) as { q: number }
  ).q

const newOrder = (
  orders: OrderService,
  productId: string,
  qtyMilli: number
): ReturnType<OrderService['getOrder']> =>
  orders.createOrder(
    {
      type: 'retail',
      lines: [{ productId, quantityMilli: qtyMilli }],
      clientOpId: crypto.randomUUID()
    },
    { userId: USER, terminalId: 'term-local-01' }
  )

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(ROOT, { recursive: true })
  A = openDatabase(DB_PATH)
  seedIfEmpty(A.db)
  branchId = (A.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  // Second connection simulating a second terminal. Short busy timeout so the
  // loser fails fast instead of stretching the suite.
  B = openDatabase(DB_PATH)
  B.db.pragma('busy_timeout = 150')
})

afterAll(() => {
  A.close()
  B.close()
  rmSync(ROOT, { recursive: true, force: true })
})

describe('RACE-001 two terminals compete for the final stock', () => {
  it('exactly one sale completes; stock never goes negative; loser is rejected cleanly', () => {
    const productId = mkTrackedProduct(2000)
    const ordersA = stackOf(A).orders
    const ordersB = stackOf(B).orders

    const orderA = newOrder(ordersA, productId, 2000)
    const orderB = newOrder(ordersB, productId, 2000)

    let loserError: Error | null = null
    const paymentsA = stackOf(A).payments({
      beforeCommit: () => {
        try {
          stackOf(B)
            .payments()
            .tender(
              {
                orderId: orderB.id,
                payments: [{ method: 'cash', amount: orderB.total }],
                clientOpId: crypto.randomUUID()
              },
              USER
            )
        } catch (e) {
          loserError = e as Error
        }
      }
    })
    paymentsA.tender(
      {
        orderId: orderA.id,
        payments: [{ method: 'cash', amount: orderA.total }],
        clientOpId: crypto.randomUUID()
      },
      USER
    )

    expect(
      loserError,
      'the competing terminal must fail while the write txn is open'
    ).not.toBeNull()
    expect(String(loserError!.message)).toMatch(/database is locked|SQLITE_BUSY/i)

    // Consistent end state: A won, stock exhausted, no oversell.
    expect(ordersA.getOrder(orderA.id).status).toBe('completed')
    expect(onHand(productId)).toBe(0)

    // The loser retrying after resolution hits the business guard, not corruption.
    expect(() =>
      stackOf(B)
        .payments()
        .tender(
          {
            orderId: orderB.id,
            payments: [{ method: 'cash', amount: orderB.total }],
            clientOpId: crypto.randomUUID()
          },
          USER
        )
    ).toThrow(/Insufficient stock/)
    expect(ordersB.getOrder(orderB.id).status).toBe('open')
    expect(onHand(productId)).toBe(0)
    expect(A.db.pragma('integrity_check', { simple: true })).toBe('ok')
  })
})

describe('RACE-002 sale racing a stock receive', () => {
  it('sale commits; receive loses the lock and succeeds on retry', () => {
    const productId = mkTrackedProduct(5000)
    const ordersA = stackOf(A).orders
    const purchasingB = stackOf(B).purchasing

    const supplierId = crypto.randomUUID()
    A.db.prepare(`INSERT INTO suppliers (id, name) VALUES (?, 'Race Supplier')`).run(supplierId)
    const po = purchasingB.createPO(
      { supplierId, items: [{ productId, qtyMilli: 3000, unitCost: 10000 }] },
      USER
    )
    purchasingB.sendPO(po.id, USER)
    const itemId = purchasingB.getPO(po.id).items[0]!.id

    const order = newOrder(ordersA, productId, 2000)
    let loserError: Error | null = null
    stackOf(A)
      .payments({
        beforeCommit: () => {
          try {
            purchasingB.receivePO(po.id, [{ itemId, qtyMilli: 3000 }], USER, 'race-rcv-1')
          } catch (e) {
            loserError = e as Error
          }
        }
      })
      .tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: crypto.randomUUID()
        },
        USER
      )

    expect(loserError).not.toBeNull()
    expect(onHand(productId)).toBe(3000) // 5000 - 2000
    purchasingB.receivePO(po.id, [{ itemId, qtyMilli: 3000 }], USER, 'race-rcv-1') // retry wins
    expect(onHand(productId)).toBe(6000)
    expect(
      (
        A.db
          .prepare(
            `SELECT COUNT(*) c FROM stock_movements WHERE product_id = ? AND reason = 'receive'`
          )
          .get(productId) as { c: number }
      ).c
    ).toBe(1)
  })
})

describe('RACE-003 two refunds on the same line', () => {
  it('only the first refund lands; the loser hits the refundable-cap', () => {
    const productId = mkTrackedProduct(10000)
    const ordersA = stackOf(A).orders
    const order = newOrder(ordersA, productId, 2000)
    stackOf(A)
      .payments()
      .tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: crypto.randomUUID()
        },
        USER
      )
    const lineId = ordersA.getOrder(order.id).lines[0]!.id

    let loserError: Error | null = null
    stackOf(A)
      .payments({
        beforeCommit: () => {
          try {
            stackOf(B)
              .payments()
              .refund(
                {
                  orderId: order.id,
                  lines: [{ orderLineId: lineId, qtyMilli: 2000 }],
                  reason: 'competing refund',
                  refundMethod: 'cash',
                  managerPin: PIN,
                  clientOpId: crypto.randomUUID()
                },
                USER
              )
          } catch (e) {
            loserError = e as Error
          }
        }
      })
      .refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: lineId, qtyMilli: 2000 }],
          reason: 'original refund',
          refundMethod: 'cash',
          managerPin: PIN,
          clientOpId: crypto.randomUUID()
        },
        USER
      )

    expect(loserError).not.toBeNull()
    // Late retry capped by refundable quantity.
    expect(() =>
      stackOf(B)
        .payments()
        .refund(
          {
            orderId: order.id,
            lines: [{ orderLineId: lineId, qtyMilli: 1 }],
            reason: 'too late',
            refundMethod: 'cash',
            managerPin: PIN,
            clientOpId: crypto.randomUUID()
          },
          USER
        )
    ).toThrow(/exceeds remaining/)

    // Money truth: exactly one refund exists for the line, equal to the full line total.
    const sums = A.db
      .prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM refunds WHERE order_id = ?`)
      .get(order.id) as { c: number; s: number }
    expect(sums.c).toBe(1)
    expect(sums.s).toBe(order.total)
  })
})

describe('RACE-004 two gift-card redemptions competing for one card', () => {
  it('no balance is ever spent twice (ledger stays authoritative)', () => {
    const code = `GC-RACE-${crypto.randomUUID().slice(0, 8)}`
    A.db
      .prepare(
        `INSERT INTO gift_cards (id, code, initial_balance, balance, status, created_at)
         VALUES (?, ?, 50000, 50000, 'active', ?)`
      )
      .run(crypto.randomUUID(), code, new Date().toISOString())

    const ordersA = stackOf(A).orders
    const orderA = newOrder(ordersA, mkTrackedProduct(10000, 40000), 1000)
    const orderB = newOrder(stackOf(B).orders, mkTrackedProduct(10000, 40000), 1000)

    let loserError: Error | null = null
    stackOf(A)
      .payments({
        beforeCommit: () => {
          try {
            stackOf(B)
              .payments()
              .tender(
                {
                  orderId: orderB.id,
                  payments: [{ method: 'gift_card', amount: 40000, giftCardCode: code }],
                  clientOpId: crypto.randomUUID()
                },
                USER
              )
          } catch (e) {
            loserError = e as Error
          }
        }
      })
      .tender(
        {
          orderId: orderA.id,
          payments: [
            { method: 'gift_card', amount: 40000, giftCardCode: code },
            { method: 'cash', amount: orderA.total - 40000 }
          ],
          clientOpId: crypto.randomUUID()
        },
        USER
      )
    expect(loserError).not.toBeNull()

    // Loser retry: card has 10_000 left, orderB needs 40_000 → insufficient.
    expect(() =>
      stackOf(B)
        .payments()
        .tender(
          {
            orderId: orderB.id,
            payments: [{ method: 'gift_card', amount: 40000, giftCardCode: code }],
            clientOpId: crypto.randomUUID()
          },
          USER
        )
    ).toThrow(/less than/)

    const card = A.db.prepare('SELECT balance FROM gift_cards WHERE code = ?').get(code) as {
      balance: number
    }
    const ledgerSum = (
      A.db
        .prepare(
          `SELECT COALESCE(SUM(g.delta),0) s FROM gift_card_transactions g
           JOIN gift_cards c ON c.id = g.card_id WHERE c.code = ? AND g.delta < 0`
        )
        .get(code) as { s: number }
    ).s
    expect(card.balance).toBe(10000)
    expect(50000 + ledgerSum).toBe(card.balance)
  })
})

describe('RACE-005 store-credit double consumption', () => {
  it('a customer balance is spent exactly once under contention', () => {
    const customers = stackOf(A).customers
    const cid = crypto.randomUUID()
    A.db
      .prepare(
        `INSERT INTO customers (id, name, store_credit, created_at) VALUES (?, 'Race Customer', 0, ?)`
      )
      .run(cid, new Date().toISOString())
    customers.adjustStoreCredit(cid, 50000, 'load') // +50_000 with ledger entry

    const ordersA = stackOf(A).orders
    const orderA = ordersA.createOrder(
      {
        type: 'retail',
        customerId: cid,
        lines: [{ productId: mkTrackedProduct(10000, 40000), quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId: USER, terminalId: 'term-local-01' }
    )
    const orderB = stackOf(B).orders.createOrder(
      {
        type: 'retail',
        customerId: cid,
        lines: [{ productId: mkTrackedProduct(10000, 40000), quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId: USER, terminalId: 'term-local-01' }
    )

    let loserError: Error | null = null
    stackOf(A)
      .payments({
        beforeCommit: () => {
          try {
            stackOf(B)
              .payments()
              .tender(
                {
                  orderId: orderB.id,
                  payments: [{ method: 'store_credit', amount: 40000 }],
                  clientOpId: crypto.randomUUID()
                },
                USER
              )
          } catch (e) {
            loserError = e as Error
          }
        }
      })
      .tender(
        {
          orderId: orderA.id,
          payments: [
            { method: 'store_credit', amount: 40000 },
            { method: 'cash', amount: orderA.total - 40000 }
          ],
          clientOpId: crypto.randomUUID()
        },
        USER
      )
    expect(loserError).not.toBeNull()
    expect(() =>
      stackOf(B)
        .payments()
        .tender(
          {
            orderId: orderB.id,
            payments: [{ method: 'store_credit', amount: 40000 }],
            clientOpId: crypto.randomUUID()
          },
          USER
        )
    ).toThrow(/less than/)

    const cust = A.db.prepare('SELECT store_credit FROM customers WHERE id = ?').get(cid) as {
      store_credit: number
    }
    const ledgerSum = (
      A.db
        .prepare(
          `SELECT COALESCE(SUM(delta),0) s FROM store_credit_transactions WHERE customer_id = ?`
        )
        .get(cid) as { s: number }
    ).s
    expect(cust.store_credit).toBe(10000)
    expect(ledgerSum).toBe(cust.store_credit)
  })
})

describe('RACE-006 order number allocation', () => {
  it('never duplicates a number and idempotent replays do not burn one', () => {
    const ordersA = stackOf(A).orders
    const ordersB = stackOf(B).orders
    const productId = mkTrackedProduct(1_000_000)
    const numbers = new Set<number>()
    const labels = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const o = (i % 2 ? ordersA : ordersB).createOrder(
        {
          type: 'retail',
          lines: [{ productId, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: USER, terminalId: 'term-local-01' }
      )
      expect(numbers.has(o.number)).toBe(false)
      expect(labels.has(o.numberLabel)).toBe(false)
      numbers.add(o.number)
      labels.add(o.numberLabel)
    }
    // Replay: same clientOpId returns the same order and re-uses no number.
    const op = crypto.randomUUID()
    const first = ordersA.createOrder(
      { type: 'retail', lines: [{ productId, quantityMilli: 1000 }], clientOpId: op },
      { userId: USER, terminalId: 'term-local-01' }
    )
    const replay = ordersB.createOrder(
      { type: 'retail', lines: [{ productId, quantityMilli: 1000 }], clientOpId: op },
      { userId: USER, terminalId: 'term-local-01' }
    )
    expect(replay.id).toBe(first.id)
    expect(replay.number).toBe(first.number)
  })
})

describe('RACE-009 shift close racing a sale', () => {
  it('close loses the lock while sale commits; retried close reconciles exactly', () => {
    const registerId = (
      A.db.prepare('SELECT id FROM registers WHERE branch_id = ? LIMIT 1').get(branchId) as {
        id: string
      }
    ).id
    const registers = stackOf(A).registers
    let shift = registers.open(registerId, 2000000, USER)

    const productId = mkTrackedProduct(10000, 25000)
    const ordersA = stackOf(A).orders
    const order = newOrder(ordersA, productId, 1000)

    let loserError: Error | null = null
    const registersB = stackOf(B).registers
    stackOf(A)
      .payments({
        beforeCommit: () => {
          try {
            registersB.close(registerId, 2000000, USER)
          } catch (e) {
            loserError = e as Error
          }
        }
      })
      .tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: crypto.randomUUID()
        },
        USER
      )

    expect(loserError).not.toBeNull()
    shift = registers.close(registerId, shift.openingFloat + order.total, USER)
    expect(shift.expectedCash).toBe(shift.openingFloat + order.total)
    expect(shift.variance).toBe(0)
  })
})

describe('RACE-010 sync outbox replay vs live work', () => {
  it('replaying a tender op is a financial no-op', () => {
    const productId = mkTrackedProduct(10000)
    const ordersA = stackOf(A).orders
    const order = newOrder(ordersA, productId, 1000)
    const opId = crypto.randomUUID()
    stackOf(A)
      .payments()
      .tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: opId
        },
        USER
      )
    // Replay the same op through a *different* connection, as a sync-resume would.
    const replayed = stackOf(B)
      .payments()
      .tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: opId
        },
        USER
      )
    expect(replayed.status).toBe('completed')
    const count = (
      A.db
        .prepare(`SELECT COUNT(*) c FROM payments WHERE client_op_id LIKE ?`)
        .get(`${opId}:%`) as { c: number }
    ).c
    expect(count).toBe(1)
    const outbox = A.db
      .prepare(`SELECT COUNT(*) c FROM sync_outbox WHERE op_id = ?`)
      .get(`tender:${opId}`) as { c: number }
    expect(outbox.c).toBe(1)
  })
})

describe('RACE-011 gift card redemption under real multi-process load', () => {
  it('N competing OS processes can never spend more than the balance', async () => {
    // Dedicated DB (the suite DB is mid-transaction-free but shared state
    // would muddy the arithmetic).
    const root = join(TMP_ROOT, `race-mp-${process.pid}`)
    mkdirSync(root, { recursive: true })
    const dbPath = join(root, 'apexpos.db')
    const setup = openDatabase(dbPath)
    seedIfEmpty(setup.db)
    const code = 'GC-MP-1'
    const INITIAL = 50000
    setup.db
      .prepare(
        `INSERT INTO gift_cards (id, code, initial_balance, balance, status, created_at)
         VALUES (?, 'GC-MP-1', ?, ?, 'active', ?)`
      )
      .run(crypto.randomUUID(), INITIAL, INITIAL, new Date().toISOString())
    setup.close()

    // Worker source: guarded atomic redeem + ledger, mirroring PaymentService.
    const sqlitePath = createRequire(import.meta.url).resolve('better-sqlite3')
    const workerSrc = `
      const Database = require(${JSON.stringify(sqlitePath)})
      const [dbPath, code, amount, attempts] = process.argv.slice(2)
      const db = new Database(dbPath)
      db.pragma('busy_timeout = 15000')
      const redeem = db.transaction(() => {
        const r = db.prepare('SELECT id, balance FROM gift_cards WHERE code = ?').get(code)
        if (!r || r.balance < Number(amount)) return false
        const upd = db.prepare('UPDATE gift_cards SET balance = balance - ?, status = CASE WHEN balance - ? = 0 THEN \\'depleted\\' ELSE status END WHERE id = ? AND balance >= ?')
        const res = upd.run(Number(amount), Number(amount), r.id, Number(amount))
        if (res.changes !== 1) throw new Error('lost guard')
        db.prepare('INSERT INTO gift_card_transactions (id, card_id, delta, balance, ref_type, created_at) VALUES (?, ?, ?, (SELECT balance FROM gift_cards WHERE id = ?), \\'mp-race\\', ?)')
          .run(crypto.randomUUID(), r.id, -Number(amount), r.id, new Date().toISOString())
        return true
      })
      let ok = 0
      for (let i = 0; i < Number(attempts); i++) {
        try { if (redeem.immediate()) ok++ } catch { /* lock contention: retry is the safe path */ }
      }
      console.log(JSON.stringify({ ok }))
    `
    const workerFile = join(root, 'worker.cjs')
    writeFileSync(workerFile, `void 0;\n${workerSrc}`)
    // (self-contained CJS; no bundling needed)
    const PROCESSES = 4
    const ATTEMPTS = 15
    const runWorker = (): Promise<{ ok: number }> =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [workerFile, dbPath, code, '1000', String(ATTEMPTS)])
        let out = ''
        let err = ''
        child.stdout.on('data', (d: Buffer) => (out += d.toString()))
        child.stderr.on('data', (d: Buffer) => (err += d.toString()))
        child.on('close', (exit) =>
          exit === 0
            ? resolve(JSON.parse(out.trim()) as { ok: number })
            : reject(new Error(`worker exited ${exit}: ${err}`))
        )
      })
    // Launch all four workers at the same instant — genuine OS-level races.
    const results = await Promise.all(Array.from({ length: PROCESSES }, runWorker))
    const totalRedeemed = results.reduce((a, r) => a + r.ok, 0)
    // 4 × 15 attempts of 1_000 against a 50_000 card → all 50 units must be taken,
    // no more, no less.
    expect(totalRedeemed).toBe(50)

    const verify = openDatabase(dbPath)
    const card = verify.db
      .prepare(`SELECT balance FROM gift_cards WHERE code = 'GC-MP-1'`)
      .get() as { balance: number }
    const ledger = verify.db
      .prepare(
        `SELECT COALESCE(SUM(delta),0) s FROM gift_card_transactions WHERE ref_type = 'mp-race'`
      )
      .get() as { s: number }
    expect(card.balance).toBe(0)
    expect(INITIAL + ledger.s).toBe(card.balance) // ledger-derived == stored
    expect(verify.db.pragma('integrity_check', { simple: true })).toBe('ok')
    verify.close()
    rmSync(root, { recursive: true, force: true })
  }, 60_000)
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from '@main/db/database'
import { makeRig, type TestRig, MANAGER_PIN } from '../helpers/rig'
import { SystemService } from '@main/services/systemService'
import { TMP_ROOT } from '../helpers/rig'
import type { TenderInput } from '@shared/ipc/api'

/**
 * FULL-DAY CAPSTONE — one continuous simulated business day, ≥ 50 mixed
 * operations, closed out with a deliberately known variance, then
 * independently reconciled from SQL (never trusting the service layer's own
 * answers), then backed up → mutated → restored → reconciled again.
 */

const U = 'seed-user'

let rig: TestRig

// Golden state tracked by hand — the oracle the DB is reconciled against.
const G = {
  cashSales: 0, // all cash applied
  cardSales: 0,
  gcSales: 0,
  scSales: 0,
  // payments currently in 'approved' state, by method
  approvedCash: 0,
  approvedCard: 0,
  approvedGc: 0,
  approvedSc: 0,
  cashRefunds: 0,
  otherRefunds: 0,
  payIns: 0,
  payOuts: 0,
  ordersCompleted: 0,
  ordersVoided: 0,
  discounts: 0,
  stock: new Map<string, number>(),
  gcBalance: new Map<string, number>(), // by code
  scBalance: 0,
  loyalty: 0
}

const newCashMinor = (major: number): number => major * 100

/** untracked products with clean, tax-free prices for exact arithmetic */
const mkProduct = (name: string, price: number, trackedStockMilli: number | null): string => {
  const unit = rig.ctx.db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
  const pid = crypto.randomUUID()
  const t = new Date().toISOString()
  rig.ctx.db
    .prepare(
      `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`
    )
    .run(
      pid,
      `CAP-${pid.slice(0, 6)}`,
      name,
      unit.id,
      price,
      trackedStockMilli === null ? 0 : 1,
      t,
      t
    )
  if (trackedStockMilli !== null) {
    rig.ctx.db
      .prepare(
        `INSERT INTO stock_movements (id, product_id, branch_id, qty_delta, reason, user_id, created_at)
         VALUES (?, ?, ?, ?, 'initial', ?, ?)`
      )
      .run(crypto.randomUUID(), pid, rig.branchId, trackedStockMilli, U, t)
    G.stock.set(pid, trackedStockMilli)
  }
  return pid
}

const sale = (
  lines: { productId: string; qtyMilli: number }[],
  tender: TenderInput['payments'],
  extra: { customerId?: string; cartDiscount?: { kind: 'amount'; value: number } } = {}
) => {
  const order = rig.orders.createOrder(
    {
      type: 'retail',
      customerId: extra.customerId,
      cartDiscount: extra.cartDiscount,
      lines: lines.map((l) => ({ productId: l.productId, quantityMilli: l.qtyMilli })),
      clientOpId: crypto.randomUUID()
    },
    { userId: U, terminalId: 'term-local-01' }
  )
  rig.payments.tender({ orderId: order.id, payments: tender, clientOpId: crypto.randomUUID() }, U)
  const done = rig.orders.getOrder(order.id)
  for (const p of tender) {
    if (p.method === 'cash') G.approvedCash += p.amount
    else if (p.method === 'card') G.approvedCard += p.amount
    else if (p.method === 'gift_card') G.approvedGc += p.amount
    else if (p.method === 'store_credit') G.approvedSc += p.amount
  }
  expect(done.status).toBe('completed')
  // invariants checked on every sale
  const paySum = tender.reduce((a, p) => a + p.amount, 0)
  expect(paySum).toBe(done.total)
  return done
}

beforeAll(() => {
  rig = makeRig('capstone')
})
afterAll(() => {
  rig.ctx.close()
})

describe('CAPSTONE: full simulated business day', () => {
  it('opens, trades, reconciles, closes with known variance, survives restore', () => {
    const registerId = (
      rig.ctx.db
        .prepare(`SELECT id FROM registers WHERE branch_id = ? LIMIT 1`)
        .get(rig.branchId) as { id: string }
    ).id
    const OPEN_FLOAT = 2_000_000 // ₨20,000.00

    // Shift open ------------------------------------------------------------
    const shift = rig.registers.open(registerId, OPEN_FLOAT, U)

    // Catalog for the day
    const p1 = mkProduct('Cap Beverage', newCashMinor(450), 20_000) // ₨450, 20 units
    const p2 = mkProduct('Cap Snack', newCashMinor(200), 12_000) // ₨200, 12 units
    const p3 = mkProduct('Cap Service', newCashMinor(1000), null) // service, ₨1000

    // CRM setup
    const custId = crypto.randomUUID()
    rig.ctx.db
      .prepare(
        `INSERT INTO customers (id, name, store_credit, loyalty_points, created_at)
         VALUES (?, 'Cap Customer', 0, 0, ?)`
      )
      .run(custId, new Date().toISOString())
    rig.customers.adjustStoreCredit(custId, 50_000, 'initial load')
    G.scBalance += 50_000
    const gc = rig.customers.issueGiftCard('GC-CAPSTONE-1', 80_000)
    G.gcBalance.set(gc.code, 80_000)

    // --- The trading day ----------------------------------------------------

    // 1..10: ten cash sales of p1 (exact amounts)
    for (let i = 0; i < 10; i++) {
      const o = sale([{ productId: p1, qtyMilli: 1000 }], [{ method: 'cash', amount: 45_000 }])
      G.cashSales += o.total
      G.stock.set(p1, G.stock.get(p1)! - 1000)
      G.ordersCompleted++
    }

    // 11: cash sale with over-tender (change given)
    {
      const o = sale(
        [{ productId: p2, qtyMilli: 1000 }],
        [{ method: 'cash', amount: 20_000, tendered: 25_000 }]
      )
      G.cashSales += o.total // change does not count
      G.stock.set(p2, G.stock.get(p2)! - 1000)
      G.ordersCompleted++
    }

    // 12: card sale
    {
      const o = sale([{ productId: p3, qtyMilli: 1000 }], [{ method: 'card', amount: 100_000 }])
      G.cardSales += o.total
      G.ordersCompleted++
    }

    // 13: split tender (cash + card)
    {
      const o = sale(
        [
          { productId: p1, qtyMilli: 1000 },
          { productId: p3, qtyMilli: 1000 }
        ],
        [
          { method: 'cash', amount: 50_000 },
          { method: 'card', amount: 95_000 }
        ]
      )
      G.cashSales += 50_000
      G.cardSales += 95_000
      G.ordersCompleted++
      expect(o.total).toBe(145_000)
      G.stock.set(p1, G.stock.get(p1)! - 1000)
    }

    // 14: gift-card sale
    {
      const o = sale(
        [{ productId: p1, qtyMilli: 1000 }],
        [{ method: 'gift_card', amount: 45_000, giftCardCode: gc.code }]
      )
      G.gcSales += o.total
      G.gcBalance.set(gc.code, G.gcBalance.get(gc.code)! - o.total)
      G.stock.set(p1, G.stock.get(p1)! - 1000)
      G.ordersCompleted++
    }

    // 15: store-credit sale (customer attached)
    {
      const o = sale(
        [{ productId: p2, qtyMilli: 1000 }],
        [{ method: 'store_credit', amount: 20_000 }],
        { customerId: custId }
      )
      G.scSales += o.total
      G.scBalance -= o.total
      G.stock.set(p2, G.stock.get(p2)! - 1000)
      G.ordersCompleted++
    }

    // 16: discounted sale (10_000 off)
    {
      const o = sale([{ productId: p1, qtyMilli: 1000 }], [{ method: 'cash', amount: 35_000 }], {
        cartDiscount: { kind: 'amount', value: 10_000 }
      })
      G.cashSales += o.total
      G.discounts += 10_000
      G.ordersCompleted++
      G.stock.set(p1, G.stock.get(p1)! - 1000)
    }

    // 17: declined card, then the same order completed in cash
    {
      const order = rig.orders.createOrder(
        {
          type: 'retail',
          lines: [{ productId: p3, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: U, terminalId: 'term-local-01' }
      )
      expect(() =>
        rig.payments.tender(
          {
            orderId: order.id,
            payments: [{ method: 'card', amount: 100_000, simulateOutcome: 'declined' }],
            clientOpId: crypto.randomUUID()
          },
          U
        )
      ).toThrow(/declined/)
      // Decline must leave no payment and no stock movement.
      expect(rig.orders.getOrder(order.id).status).toBe('open')
      expect(
        (
          rig.ctx.db
            .prepare('SELECT COUNT(*) c FROM payments WHERE order_id = ?')
            .get(order.id) as { c: number }
        ).c
      ).toBe(0)
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: 100_000 }],
          clientOpId: crypto.randomUUID()
        },
        U
      )
      G.cashSales += 100_000
      G.approvedCash += 100_000
      G.ordersCompleted++
    }

    // 18: hold → recall → pay
    {
      const order = rig.orders.createOrder(
        {
          type: 'retail',
          holdName: 'cap-hold',
          lines: [{ productId: p1, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: U, terminalId: 'term-local-01' }
      )
      expect(rig.orders.listHeld().some((o) => o.id === order.id)).toBe(true)
      rig.orders.recall(order.id, U)
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: 45_000 }],
          clientOpId: crypto.randomUUID()
        },
        U
      )
      G.cashSales += 45_000
      G.approvedCash += 45_000
      G.stock.set(p1, G.stock.get(p1)! - 1000)
      G.ordersCompleted++
    }

    // 19: refund in cash (full order #1's sibling)
    function refundFull(orderId: string, method: 'cash' | 'store_credit' | 'original'): void {
      const order = rig.orders.getOrder(orderId)
      // The order's payments flip to 'refunded' — out of the approved buckets.
      const parts = rig.ctx.db
        .prepare(
          `SELECT method, COALESCE(SUM(amount),0) s FROM payments WHERE order_id = ? GROUP BY method`
        )
        .all(orderId) as { method: string; s: number }[]
      order.lines.forEach((line) => {
        rig.payments.refund(
          {
            orderId,
            lines: [{ orderLineId: line.id, qtyMilli: line.quantity }],
            reason: 'capstone refund',
            refundMethod: method,
            managerPin: MANAGER_PIN,
            clientOpId: crypto.randomUUID()
          },
          U
        )
      })
      for (const p of parts) {
        if (p.method === 'cash') G.approvedCash -= p.s
        else if (p.method === 'card') G.approvedCard -= p.s
        else if (p.method === 'gift_card') G.approvedGc -= p.s
        else if (p.method === 'store_credit') G.approvedSc -= p.s
      }
      if (method === 'cash') G.cashRefunds += order.total
      else G.otherRefunds += order.total
    }

    // cash refund of order 16's value (a previously completed cash order):
    // refund one of the p1 cash sales from the first batch.
    {
      const target = (
        rig.ctx.db
          .prepare(
            `SELECT o.id FROM orders o JOIN order_lines l ON l.order_id = o.id
             WHERE o.status = 'completed' AND l.product_id = ? LIMIT 1`
          )
          .get(p1) as { id: string }
      ).id
      const total = rig.orders.getOrder(target).total
      refundFull(target, 'cash')
      G.stock.set(p1, G.stock.get(p1)! + 1000)
      void total
    }

    // 20: refund to store credit (order had a cash tender)
    {
      const order = rig.orders.createOrder(
        {
          type: 'retail',
          customerId: custId,
          lines: [{ productId: p2, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: U, terminalId: 'term-local-01' }
      )
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: 20_000 }],
          clientOpId: crypto.randomUUID()
        },
        U
      )
      G.cashSales += 20_000
      G.approvedCash += 20_000
      G.stock.set(p2, G.stock.get(p2)! - 1000)
      G.ordersCompleted++
      refundFull(order.id, 'store_credit')
      G.scBalance += 20_000
      G.stock.set(p2, G.stock.get(p2)! + 1000)
    }

    // 21: gift-card sale refunded to original (restores the card balance)
    {
      const gc2 = rig.customers.issueGiftCard('GC-CAPSTONE-2', 100_000)
      G.gcBalance.set(gc2.code, 100_000)
      const order = rig.orders.createOrder(
        {
          type: 'retail',
          lines: [{ productId: p3, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: U, terminalId: 'term-local-01' }
      )
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'gift_card', amount: 100_000, giftCardCode: gc2.code }],
          clientOpId: crypto.randomUUID()
        },
        U
      )
      G.gcSales += 100_000
      G.approvedGc += 100_000
      G.gcBalance.set(gc2.code, 100_000 - 100_000)
      G.ordersCompleted++
      refundFull(order.id, 'original')
      G.gcBalance.set(gc2.code, 100_000) // fully restored
      const row = rig.ctx.db
        .prepare('SELECT balance FROM gift_cards WHERE code = ?')
        .get(gc2.code) as { balance: number }
      expect(row.balance).toBe(100_000)
    }

    // 22: void a held order (manager-approved, never paid)
    {
      const approver = rig.auth.verifyOverride(MANAGER_PIN, 'sales.void')
      const order = rig.orders.createOrder(
        {
          type: 'retail',
          holdName: 'to-void',
          lines: [{ productId: p1, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: U, terminalId: 'term-local-01' }
      )
      rig.orders.voidOrder(order.id, 'customer walked out', approver, U)
      G.ordersVoided++
      expect(rig.orders.getOrder(order.id).status).toBe('void')
    }

    // 23: purchasing — send + partially receive + finally receive
    {
      const supplierId = (
        rig.ctx.db.prepare('SELECT id FROM suppliers LIMIT 1').get() as { id: string }
      ).id
      const po = rig.purchasing.createPO(
        { supplierId, items: [{ productId: p1, qtyMilli: 10_000, unitCost: 30_000 }] },
        U
      )
      rig.purchasing.sendPO(po.id, U)
      const item = rig.purchasing.getPO(po.id).items[0]!
      rig.purchasing.receivePO(po.id, [{ itemId: item.id, qtyMilli: 4000 }], U, 'cap-po-1')
      expect(rig.purchasing.getPO(po.id).status).toBe('partial')
      rig.purchasing.receivePO(po.id, [{ itemId: item.id, qtyMilli: 6000 }], U, 'cap-po-2')
      expect(rig.purchasing.getPO(po.id).status).toBe('received')
      G.stock.set(p1, G.stock.get(p1)! + 10_000)
    }

    // 24: stock adjustments (manager PIN) — waste one unit of p2, correct +1 p1
    {
      rig.products.adjustStock(
        {
          productId: p2,
          qtyDeltaMilli: -1000,
          reason: 'waste',
          note: 'dropped tray',
          managerPin: MANAGER_PIN
        },
        U
      )
      G.stock.set(p2, G.stock.get(p2)! - 1000)
      rig.products.adjustStock(
        {
          productId: p1,
          qtyDeltaMilli: 1000,
          reason: 'adjustment',
          note: 'counting fix',
          managerPin: MANAGER_PIN
        },
        U
      )
      G.stock.set(p1, G.stock.get(p1)! + 1000)
    }

    // 25: pay-in + pay-out
    rig.registers.payIn(shift.id, 50_000, 'owner float top-up', U)
    G.payIns += 50_000
    rig.registers.payOut(shift.id, 30_000, 'supplier petty cash', U)
    G.payOuts += 30_000

    // 26: loyalty adjustment
    rig.customers.adjustLoyalty(custId, 120, 'day bonus')
    G.loyalty += 120

    // --- Close the day with a deliberately known variance -------------------
    const expectedCash = OPEN_FLOAT + G.cashSales - G.cashRefunds + G.payIns - G.payOuts
    const countedCash = expectedCash - 5_000 // ₨50.00 short — intentional
    const closed = rig.registers.close(registerId, countedCash, U, 'capstone EOD')
    expect(closed.variance).toBe(-5_000)
    expect(closed.expectedCash).toBe(expectedCash)

    // --- Independent reconciliation ----------------------------------------
    const q = <T>(sql: string, ...args: unknown[]): T => rig.ctx.db.prepare(sql).get(...args) as T

    // Payments
    // Scope: only orders containing capstone products (demo seed history is
    // timestamped up to "now"; sku-prefix scope is unambiguous).
    const CAPSTONE_SCOPE = `EXISTS (
      SELECT 1 FROM order_lines l JOIN products pr ON pr.id = l.product_id
      WHERE l.order_id = {order}.id AND pr.sku LIKE 'CAP-%'
    )`
    const payments = rig.ctx.db
      .prepare(
        `SELECT method, COALESCE(SUM(amount),0) s
         FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE p.status = 'approved' AND ${CAPSTONE_SCOPE.replace('{order}', 'o')}
         GROUP BY method`
      )
      .all() as { method: string; s: number }[]
    const byMethod = Object.fromEntries(payments.map((p) => [p.method, p.s]))
    expect(byMethod.cash ?? 0).toBe(G.approvedCash)
    expect(byMethod.card ?? 0).toBe(G.approvedCard)
    expect(byMethod.gift_card ?? 0).toBe(G.approvedGc)
    expect(byMethod.store_credit ?? 0).toBe(G.approvedSc)

    // Refunds (cash-settled only touch the drawer)
    const cashRefunded = q<{ s: number }>(
      `SELECT COALESCE(SUM(r.total),0) s FROM refunds r JOIN orders o ON o.id = r.order_id
       WHERE r.method = 'cash' AND ${CAPSTONE_SCOPE.replace('{order}', 'o')}`
    ).s
    expect(cashRefunded).toBe(G.cashRefunds)

    // Inventory: on-hand == sum of movements, for every touched product
    for (const [pid, expected] of G.stock) {
      const onHand = q<{ s: number }>(
        `SELECT COALESCE(SUM(qty_delta),0) s FROM stock_movements WHERE product_id = ? AND branch_id = ?`,
        pid,
        rig.branchId
      ).s
      expect(onHand, `stock mismatch for ${pid}`).toBe(expected)
      expect(onHand).toBeGreaterThanOrEqual(0)
    }

    // Gift card: ledger-derived balance == stored balance
    const gcRow = q<{ balance: number }>(`SELECT balance FROM gift_cards WHERE code = ?`, gc.code)
    const gcLedger = q<{ s: number }>(
      `SELECT COALESCE(SUM(delta),0) s FROM gift_card_transactions WHERE card_id = (SELECT id FROM gift_cards WHERE code = ?)`,
      gc.code
    ).s
    expect(gcRow.balance).toBe(G.gcBalance.get(gc.code))
    // Ledger-derived balance: Σ deltas (including the issuing credit) == stored.
    expect(gcLedger).toBe(gcRow.balance)

    // Store credit: ledger-derived == stored
    const custRow = q<{ store_credit: number }>(
      `SELECT store_credit FROM customers WHERE id = ?`,
      custId
    )
    const scLedger = q<{ s: number }>(
      `SELECT COALESCE(SUM(delta),0) s FROM store_credit_transactions WHERE customer_id = ?`,
      custId
    ).s
    expect(custRow.store_credit).toBe(G.scBalance)
    expect(scLedger).toBe(custRow.store_credit)

    // Loyalty: ledger-derived == stored
    const loyaltyRow = q<{ loyalty_points: number }>(
      `SELECT loyalty_points FROM customers WHERE id = ?`,
      custId
    )
    const loyaltyLedger = q<{ s: number }>(
      `SELECT COALESCE(SUM(delta),0) s FROM loyalty_transactions WHERE customer_id = ?`,
      custId
    ).s
    expect(loyaltyRow.loyalty_points).toBe(G.loyalty)
    expect(loyaltyLedger).toBe(loyaltyRow.loyalty_points)

    // Shifts in the ledger balance against themselves
    const closedRow = q<{ expected_cash: number; counted_cash: number; variance: number }>(
      `SELECT expected_cash, counted_cash, variance FROM shifts WHERE id = ?`,
      shift.id
    )
    expect(closedRow.variance).toBe(closedRow.counted_cash - closedRow.expected_cash)

    // No completed order was ever under-funded (refunded payments still
    // prove the order WAS funded; approval state changes after refund).
    const badOrders = rig.ctx.db
      .prepare(
        `SELECT o.id FROM orders o
         WHERE o.status = 'completed' AND ${CAPSTONE_SCOPE.replace('{order}', 'o')}
           AND (SELECT COALESCE(SUM(amount),0) FROM payments p
                WHERE p.order_id = o.id AND p.status IN ('approved','refunded')) < o.total`
      )
      .all()
    expect(badOrders.length).toBe(0)

    // Audit coverage: every refund and every adjustment is audited
    const refundAudits = (
      rig.ctx.db
        .prepare(`SELECT COUNT(*) c FROM audit_log WHERE action = 'payments.refund'`)
        .get() as { c: number }
    ).c
    const refundCount = (
      rig.ctx.db.prepare(`SELECT COUNT(*) c FROM refunds`).get() as { c: number }
    ).c
    expect(refundAudits).toBeGreaterThanOrEqual(refundCount)

    // DB-level integrity
    expect(rig.ctx.db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect((rig.ctx.db.pragma('foreign_key_check') as unknown[]).length).toBe(0)

    // --- Backup → mutate → restore → reconcile again ------------------------
    const backupDir = join(TMP_ROOT, `capstone-bak-${process.pid}`)
    mkdirSync(join(backupDir, 'backups'), { recursive: true })
    rig.ctx.db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(rig.path, join(backupDir, 'apexpos.db'))
    const system = new SystemService(rig.ctx.db, backupDir)
    const backup = system.createBackup()
    const goldenOrderCount = (
      rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }
    ).c

    // mutate the "live" copy: an extra sale that should disappear after restore
    {
      const postOrder = rig.orders.createOrder(
        {
          type: 'retail',
          lines: [{ productId: p3, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId: U, terminalId: 'term-local-01' }
      )
      rig.payments.tender(
        {
          orderId: postOrder.id,
          payments: [{ method: 'cash', amount: postOrder.total }],
          clientOpId: crypto.randomUUID()
        },
        U
      )
      rig.ctx.db.pragma('wal_checkpoint(TRUNCATE)')
      copyFileSync(rig.path, join(backupDir, 'apexpos.db'))
    }

    system.restoreBackup(backup.file.split('/').pop()!)
    const restored = openDatabase(join(backupDir, 'apexpos.db'))
    expect(restored.db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect((restored.db.pragma('foreign_key_check') as unknown[]).length).toBe(0)
    const restoredOrders = (
      restored.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }
    ).c
    expect(restoredOrders).toBe(goldenOrderCount)
    const restoredGc = (
      restored.db.prepare('SELECT balance FROM gift_cards WHERE code = ?').get(gc.code) as {
        balance: number
      }
    ).balance
    expect(restoredGc).toBe(G.gcBalance.get(gc.code))
    restored.close()
    rmSync(backupDir, { recursive: true, force: true })
  })
})

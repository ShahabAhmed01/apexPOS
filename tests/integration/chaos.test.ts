import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { PurchaseService } from '@main/services/purchaseService'
import { SystemService } from '@main/services/systemService'
import { SyncService } from '@main/services/syncService'
import { TMP_ROOT, MANAGER_PIN } from '../helpers/rig'
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CHAOS suite — inject failures at commit time and prove the system is
 * all-or-nothing: finances, stock, ledgers and audit may NEVER be left
 * half-written. Also exercises crash/restart and corrupt restore paths.
 */

const ROOT = join(TMP_ROOT, `chaos-${process.pid}`)
const DB_PATH = join(ROOT, 'apexpos.db')
const USER = 'seed-user'

let ctx: DbContext
let ctxOpen = true
let auth: AuthService
let sync: SyncService
let branchId: string

interface Rig {
  orders: OrderService
  payments: PaymentService
  purchasing: PurchaseService
}

const rig = (hooks?: { beforeCommit?: (label: string) => void }): Rig => {
  const orders = new OrderService(ctx.db, auth, branchId, sync)
  return {
    orders,
    payments: new PaymentService(
      ctx.db,
      auth,
      branchId,
      (orderId, userId) => orders.completePayment(orderId, userId),
      (orderId) => orders.getOrder(orderId),
      sync,
      hooks
    ),
    purchasing: new PurchaseService(ctx.db, auth, branchId, hooks, sync)
  }
}

const untrackedProduct = (): { id: string; price: number } =>
  ctx.db.prepare(`SELECT id, price FROM products WHERE track_stock = 0 LIMIT 1`).get() as {
    id: string
    price: number
  }

const saleOrder = (orders: OrderService, price = 15000): ReturnType<OrderService['getOrder']> => {
  const p = untrackedProduct()
  return orders.createOrder(
    {
      type: 'retail',
      lines: [{ productId: p.id, quantityMilli: 1000, unitPriceOverride: price }],
      clientOpId: crypto.randomUUID()
    },
    { userId: USER, terminalId: 'term-local-01' }
  )
}

const counts = (): Record<string, number> => {
  const tables = [
    'orders',
    'payments',
    'refunds',
    'refund_lines',
    'stock_movements',
    'gift_card_transactions',
    'store_credit_transactions',
    'sync_outbox',
    'audit_log'
  ]
  const out: Record<string, number> = {}
  for (const t of tables) {
    out[t] = (ctx.db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c
  }
  return out
}

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(ROOT, { recursive: true })
  ctx = openDatabase(DB_PATH)
  seedIfEmpty(ctx.db)
  branchId = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  auth = new AuthService(ctx.db)
  sync = new SyncService(ctx.db)
})

afterAll(() => {
  if (ctxOpen) ctx.close()
})

describe('CHAOS-01 crash inside the tender transaction', () => {
  it('nothing persists: no payment, no stock movement, no outbox, no audit', () => {
    const { orders, payments } = rig({
      beforeCommit: () => {
        throw new Error('CRASH: power loss at commit')
      }
    })
    const order = saleOrder(orders)
    const orderCountBeforeLine = (
      ctx.db.prepare('SELECT COUNT(*) c FROM order_lines WHERE order_id = ?').get(order.id) as {
        c: number
      }
    ).c
    expect(orderCountBeforeLine).toBeGreaterThan(0)
    const before = counts()

    expect(() =>
      payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: crypto.randomUUID()
        },
        USER
      )
    ).toThrow(/CRASH/)

    const after = counts()
    expect(after).toEqual(before) // every table untouched
    expect(orders.getOrder(order.id).status).toBe('open') // order survives, payable later
  })
})

describe('CHAOS-02 crash inside the refund transaction', () => {
  it('refund rolls back completely: quantities, balances, payment tracking unchanged', () => {
    const { orders, payments } = rig()
    const order = saleOrder(orders)
    payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total }],
        clientOpId: crypto.randomUUID()
      },
      USER
    )
    const lineId = orders.getOrder(order.id).lines[0]!.id
    const before = counts()

    const failing = rig({
      beforeCommit: (label) => {
        if (label === 'payments.refund') throw new Error('CRASH mid-refund')
      }
    })
    expect(() =>
      failing.payments.refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: lineId, qtyMilli: 1000 }],
          reason: 'interrupted refund',
          refundMethod: 'cash',
          managerPin: MANAGER_PIN,
          clientOpId: crypto.randomUUID()
        },
        USER
      )
    ).toThrow(/CRASH/)

    // The successful manager-override itself is audited before the refund
    // transaction begins — that audit row is intentional and must remain.
    // Everything from the refund transaction proper must be rolled back.
    const after = counts()
    const beforeAudit = before['audit_log'] ?? 0
    expect(after['audit_log']).toBe(beforeAudit + 1)
    const extraAudit = ctx.db
      .prepare(`SELECT action FROM audit_log ORDER BY created_at DESC LIMIT 1`)
      .get() as { action: string }
    expect(extraAudit.action).toBe('auth.override')
    delete (after as Record<string, number>)['audit_log']
    delete (before as Record<string, number>)['audit_log']
    expect(after).toEqual(before)
    expect(
      (
        ctx.db.prepare('SELECT refunded_qty FROM order_lines WHERE id = ?').get(lineId) as {
          refunded_qty: number
        }
      ).refunded_qty
    ).toBe(0)
    expect(
      ctx.db
        .prepare('SELECT refunded_amount, status FROM payments WHERE order_id = ?')
        .get(order.id) as {
        refunded_amount: number
        status: string
      }
    ).toEqual({ refunded_amount: 0, status: 'approved' })
  })
})

describe('CHAOS-03 crash inside PO receive', () => {
  it('qty_received, stock and cost are all-or-nothing', () => {
    const { purchasing } = rig()
    const supplierRow = ctx.db.prepare('SELECT id FROM suppliers LIMIT 1').get() as { id: string }
    const product = untrackedProduct()
    const po = purchasing.createPO(
      {
        supplierId: supplierRow.id,
        items: [{ productId: product.id, qtyMilli: 2000, unitCost: 10000 }]
      },
      USER
    )
    purchasing.sendPO(po.id, USER)
    const itemId = purchasing.getPO(po.id).items[0]!.id
    const before = counts()

    const failing = rig({
      beforeCommit: (label) => {
        if (label === 'po.receive') throw new Error('CRASH during receiving')
      }
    })
    expect(() =>
      failing.purchasing.receivePO(po.id, [{ itemId, qtyMilli: 2000 }], USER, crypto.randomUUID())
    ).toThrow(/CRASH/)

    expect(counts()).toEqual(before)
    expect(purchasing.getPO(po.id).items[0]!.qtyReceived).toBe(0)
    expect(purchasing.getPO(po.id).status).toBe('sent')

    // And the same logical operation can be cleanly retried afterwards.
    purchasing.receivePO(po.id, [{ itemId, qtyMilli: 2000 }], USER, crypto.randomUUID())
    expect(purchasing.getPO(po.id).status).toBe('received')
  })
})

describe('CHAOS-04 application restart between create and tender', () => {
  it('an open order survives a full DB restart payable and uncompromised', () => {
    const { orders } = rig()
    const order = saleOrder(orders)
    const opId = crypto.randomUUID()

    // Simulate hard crash: close the DB entirely, reopen the same file.
    ctx.close()
    ctxOpen = false
    ctx = openDatabase(DB_PATH)
    ctxOpen = true
    auth = new AuthService(ctx.db)
    sync = new SyncService(ctx.db)

    const { orders: orders2, payments: payments2 } = rig()
    expect(orders2.getOrder(order.id).status).toBe('open')

    payments2.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total }],
        clientOpId: opId
      },
      USER
    )
    // Replay after restart (e.g. renderer retried) — must be a no-op.
    const replayed = payments2.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total }],
        clientOpId: opId
      },
      USER
    )
    expect(replayed.status).toBe('completed')
    expect(
      (
        ctx.db.prepare('SELECT COUNT(*) c FROM payments WHERE order_id = ?').get(order.id) as {
          c: number
        }
      ).c
    ).toBe(1)
  })
})

describe('CHAOS-05 restore rejects a corrupt / foreign backup', () => {
  it('garbage file is refused and the live database is untouched', () => {
    const dir = join(ROOT, 'corrupt')
    mkdirSync(join(dir, 'backups'), { recursive: true })
    copyFileSync(DB_PATH, join(dir, 'apexpos.db'))
    writeFileSync(join(dir, 'backups', 'garbage.db'), 'this is not sqlite at all'.repeat(64))
    const system = new SystemService(ctx.db, dir)

    expect(() => system.restoreBackup('garbage.db')).toThrow(/integrity|not a database|unreadable/i)
    // live DB untouched
    expect(ctx.db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(existsSync(join(dir, 'apexpos.db'))).toBe(true)
  })

  it('a non-APEXPOS sqlite file is refused as well', () => {
    const dir = join(ROOT, 'foreign')
    mkdirSync(join(dir, 'backups'), { recursive: true })
    copyFileSync(DB_PATH, join(dir, 'apexpos.db'))
    const foreign = openDatabase(join(dir, 'backups', 'apexpos-2099-01-01.db'))
    foreign.close() // valid sqlite, real schema — this is admissible…
    // …now create one that is a sqlite file but not ours
    const alien = openDatabase(join(dir, 'backups', 'alien.db'))
    alien.db.exec('DROP TABLE migrations') // remove the APEXPOS fingerprint
    alien.close()
    const system = new SystemService(ctx.db, dir)
    expect(() => system.restoreBackup('alien.db')).toThrow(/not an APEXPOS database/)
  })

  it('a sound backup restores end-to-end and passes integrity checks', () => {
    const dir = join(ROOT, 'good')
    mkdirSync(join(dir, 'backups'), { recursive: true })
    copyFileSync(DB_PATH, join(dir, 'apexpos.db'))
    const system = new SystemService(ctx.db, dir)
    const backup = system.createBackup()
    const files = readdirSync(join(dir, 'backups'))
    expect(files).toContain(backup.file.split('/').pop()!)

    const beforeOrders = (ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    // mutate live data, then restore the earlier snapshot
    const { orders } = rig()
    saleOrder(orders)
    ctx.db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(DB_PATH, join(dir, 'apexpos.db')) // "live" changed
    // Put the backup bytes back over the live file via restoreBackup
    system.restoreBackup(backup.file.split('/').pop()!)
    const restored = openDatabase(join(dir, 'apexpos.db'))
    expect(restored.db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect((restored.db.pragma('foreign_key_check') as unknown[]).length).toBe(0)
    expect((restored.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c).toBe(
      beforeOrders
    )
    restored.close()
  })
})

describe('CHAOS-06 migration idempotency & integrity', () => {
  it('re-running migrations is a no-op; FK enforcement is on; integrity is ok', () => {
    const reopened = openDatabase(DB_PATH)
    const applied = reopened.db.prepare('SELECT id FROM migrations ORDER BY id').all() as {
      id: number
    }[]
    expect(applied.map((m) => m.id)).toEqual([1, 2])
    expect(reopened.db.pragma('foreign_keys', { simple: true })).toBe(1)
    // FK violation rejected
    expect(() =>
      reopened.db
        .prepare(
          `INSERT INTO payments (id, order_id, method, amount, status, created_at)
           VALUES (?, 'no-such-order', 'cash', 1, 'approved', ?)`
        )
        .run(crypto.randomUUID(), new Date().toISOString())
    ).toThrow(/FOREIGN KEY/)
    reopened.close()
  })
})

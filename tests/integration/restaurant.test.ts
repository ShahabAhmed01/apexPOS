import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeRig, destroyRig, type TestRig, SYSTEM_USER } from '../helpers/rig'
import { RestaurantService } from '@main/services/restaurantService'
import { OrderService } from '@main/services/orderService'
import { openDatabase } from '@main/db/database'

/**
 * RST-* — Restaurant workflow integrity: seating, dine-in order lifecycle,
 * transfer, split/move-lines, merge, close-table payment safety, and
 * branch isolation of every table/order mutation.
 */

let rig: TestRig
let rst: RestaurantService
let orders: OrderService
let branchB: string
let rstB: RestaurantService
let ordersB: OrderService

/** Two fresh tables in the main branch per test group. */
const mkTable = (name: string): string => {
  const zone = rig.ctx.db
    .prepare('SELECT id FROM zones WHERE branch_id = ? LIMIT 1')
    .get(rig.branchId) as { id: string } | undefined
  const zoneId =
    zone?.id ??
    (() => {
      const zid = crypto.randomUUID()
      rig.ctx.db
        .prepare(
          `INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, 'TestZone', 99)`
        )
        .run(zid, rig.branchId)
      return zid
    })()
  const tid = crypto.randomUUID()
  rig.ctx.db
    .prepare(`INSERT INTO restaurant_tables (id, zone_id, name, capacity) VALUES (?, ?, ?, 4)`)
    .run(tid, zoneId, name)
  return tid
}

const menuItem = (): { id: string; price: number } =>
  rig.ctx.db
    .prepare(`SELECT id, price FROM products WHERE type = 'standard' AND track_stock = 0 LIMIT 1`)
    .get() as { id: string; price: number }

const addLine = (orderId: string, productId: string, qtyMilli: number): void => {
  const cur = orders.getOrder(orderId)
  orders.updateDraft(
    orderId,
    {
      type: 'dine_in',
      lines: [
        ...cur.lines.map((l) => ({
          productId: l.productId,
          quantityMilli: l.quantity,
          variantId: l.variantId
        })),
        { productId, quantityMilli: qtyMilli }
      ],
      clientOpId: crypto.randomUUID()
    },
    { userId: SYSTEM_USER }
  )
}

beforeAll(() => {
  rig = makeRig('restaurant')
  rst = new RestaurantService(rig.ctx.db, rig.branchId)
  orders = rig.orders
  branchB = crypto.randomUUID()
  rig.ctx.db
    .prepare(
      `INSERT INTO branches (id, organization_id, name, code) VALUES (?,
       (SELECT id FROM organizations LIMIT 1), 'RstB', 'RSTB')`
    )
    .run(branchB)
  rstB = new RestaurantService(rig.ctx.db, branchB)
  ordersB = new OrderService(rig.ctx.db, rig.auth, branchB)
})

afterAll(() => destroyRig(rig))

describe('RST-01 seat & order lifecycle', () => {
  it('opens a table, accumulates lines, transfers, and frees on payment', () => {
    const t1 = mkTable('RST-T1')
    const t2 = mkTable('RST-T2')
    const item = menuItem()

    const orderId = rst.openTable(t1, 2, SYSTEM_USER)
    expect(rst.tables().find((t) => t.id === t1)!.status).toBe('seated')

    // Re-opening the same table returns the same active order (idempotent seat)
    expect(rst.openTable(t1, 4, SYSTEM_USER)).toBe(orderId)

    addLine(orderId, item.id, 1000)
    const afterOne = orders.getOrder(orderId)
    addLine(orderId, item.id, 2000)
    const order = orders.getOrder(orderId)
    expect(order.lines.length).toBe(2)
    expect(order.total).toBe(afterOne.total * 3) // price(1000) + price(2000)
    expect(order.total).toBe(order.lines.reduce((a, l) => a + l.lineTotal, 0))

    // Transfer whole order to the free table
    rst.transferOrderToTable(orderId, t2)
    expect(orders.getOrder(orderId).tableId).toBe(t2)
    expect(rst.tables().find((t) => t.id === t1)!.status).toBe('free')
    expect(rst.tables().find((t) => t.id === t2)!.status).toBe('seated')
  })
})

describe('RST-02 close-table payment safety', () => {
  it('refuses to close a table with an unpaid, itemized order', () => {
    const t = mkTable('RST-C1')
    const orderId = rst.openTable(t, 2, SYSTEM_USER)
    addLine(orderId, menuItem().id, 1000)
    expect(() => rst.closeTable(t)).toThrow(/unpaid order/)
    // Order intact, table still occupied
    expect(rst.tables().find((x) => x.id === t)!.status).not.toBe('free')
    expect(orders.getOrder(orderId).status).toBe('open')
  })

  it('closing an empty table voids the empty shell order', () => {
    const t = mkTable('RST-C2')
    const orderId = rst.openTable(t, 1, SYSTEM_USER)
    rst.closeTable(t)
    expect(orders.getOrder(orderId).status).toBe('void')
    expect(rst.tables().find((x) => x.id === t)!.status).toBe('free')
  })
})

describe('RST-03 split / move-lines', () => {
  it('moving a subset splits the bill with recomputed totals on both orders', () => {
    const a = mkTable('RST-S1')
    const b = mkTable('RST-S2')
    const item = menuItem()
    const orderId = rst.openTable(a, 2, SYSTEM_USER)
    addLine(orderId, item.id, 1000)
    addLine(orderId, item.id, 3000)
    const before = orders.getOrder(orderId)
    const lineToMove = before.lines[1]!

    const targetOrderId = rst.moveLines(orderId, [lineToMove.id], b)
    const source = orders.getOrder(orderId)
    const target = orders.getOrder(targetOrderId)

    expect(source.lines.length).toBe(1)
    expect(target.lines.length).toBe(1)
    expect(source.total).toBe(item.price * 1)
    expect(target.total).toBe(item.price * 3)
    expect(source.taxTotal + target.taxTotal).toBe(before.taxTotal)
    expect(source.status).not.toBe('void')
    // Neither order may exceed what was originally ordered
    expect(source.total + target.total).toBe(before.total)
  })

  it('moving ALL lines voids the source and frees the table (merge)', () => {
    const a = mkTable('RST-M1')
    const b = mkTable('RST-M2')
    const item = menuItem()
    const orderId = rst.openTable(a, 2, SYSTEM_USER)
    addLine(orderId, item.id, 2000)
    const targetId = rst.openTable(b, 2, SYSTEM_USER)
    addLine(targetId, item.id, 1000)

    rst.mergeTables(orderId, b)
    expect(orders.getOrder(orderId).status).toBe('void')
    expect(rst.tables().find((t) => t.id === a)!.status).toBe('free')
    const merged = orders.getOrder(targetId)
    expect(merged.lines.length).toBe(2)
    expect(merged.total).toBe(item.price * 3)
  })

  it('rejects transfers onto an occupied table', () => {
    const a = mkTable('RST-X1')
    const b = mkTable('RST-X2')
    const o1 = rst.openTable(a, 2, SYSTEM_USER)
    rst.openTable(b, 2, SYSTEM_USER)
    expect(() => rst.transferOrderToTable(o1, b)).toThrow(/already has an active order/)
  })
})

describe('RST-04 branch isolation', () => {
  it('branch B cannot touch branch A tables or orders', () => {
    const t = mkTable('RST-B1')
    const orderId = rst.openTable(t, 2, SYSTEM_USER)
    addLine(orderId, menuItem().id, 1000)

    expect(() => rstB.bumpTicket(orderId)).toThrow(/different branch/)
    expect(() => rstB.transferOrderToTable(orderId, mkTable('RST-B2'))).toThrow(/different branch/)
    expect(() => rstB.closeTable(t)).toThrow(/different branch/)
    expect(() => rstB.openTable(t, 2, SYSTEM_USER)).toThrow(/different branch/)
    expect(() => rstB.setOrderStatus(orderId, 'billed')).toThrow(/different branch/)
    // and its own branch has no access to A's order via orders service
    expect(() => ordersB.getOrder(orderId)).toThrow(/different branch/)
  })
})

describe('RST-05 RACE-008 simultaneous transfers', () => {
  it('a transfer racing an open write transaction loses cleanly, then succeeds', () => {
    const a = mkTable('RST-R1')
    const b = mkTable('RST-R2')
    const orderId = rst.openTable(a, 2, SYSTEM_USER)
    addLine(orderId, menuItem().id, 1000)

    // Open a competing transaction on a second connection (a second terminal).
    const other = openDatabase(rig.path)
    rig.ctx.db.pragma('busy_timeout = 200') // fail fast on contention in this test
    try {
      other.db.exec('BEGIN IMMEDIATE')
      expect(() => rst.transferOrderToTable(orderId, b)).toThrow(/locked/i)
      other.db.exec('ROLLBACK')
      // After the lock holder backs off, the transfer succeeds — no partial move.
      rst.transferOrderToTable(orderId, b)
      expect(orders.getOrder(orderId).tableId).toBe(b)
      expect(rst.tables().find((t) => t.id === a)!.status).toBe('free')
    } finally {
      rig.ctx.db.pragma('busy_timeout = 5000')
      other.close()
    }
  })
})

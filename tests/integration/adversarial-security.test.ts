import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeRig, destroyRig, type TestRig } from '../helpers/rig'
import { SessionStore } from '@main/services/sessionStore'
import { RestaurantService } from '@main/services/restaurantService'
import { AppError } from '@shared/lib/errors'

/**
 * ADVERSARIAL-SECURITY — attack the trust boundaries: session lock, lockout
 * counters, branch scoping, dine-in state machine, audit attribution.
 * Failing test = confirmed defect with an ID.
 */

let rig: TestRig
let userId: string

beforeEach(() => {
  rig = makeRig('advsec')
  userId = rig.auth.login('manager', 'Manager123!').user.id
})

afterEach(() => destroyRig(rig))

describe('SEC — session lock must gate every privileged path', () => {
  it('TC-SEC-LOCK-001: once locked, the session store yields NO session (IPC gate depends on get())', () => {
    const store = new SessionStore()
    const session = rig.auth.login('manager', 'Manager123!')
    store.set(session)
    expect(store.get()).not.toBeNull()
    store.lock()
    // A locked terminal must behave as if NOBODY is logged in.
    expect(store.get()).toBeNull()
    expect(store.isLocked()).toBe(true)
  })
})

describe('SEC — brute-force lockout must survive username case tricks', () => {
  it('TC-SEC-LOGIN-001: lockout counter is case-insensitive (ADMIN/admin share one counter)', () => {
    // 5 failures on one casing...
    for (let i = 0; i < 5; i++) {
      expect(() => rig.auth.login('CASHIER', 'wrong-password')).toThrowError(/invalid/i)
    }
    // ...must lock the account for the other casing too.
    expect(() => rig.auth.login('cashier', 'Cashier123!')).toThrowError(/too many/i)
  })

  it('TC-SEC-LOGIN-002: PIN lockout is per user and a correct PIN clears nothing extra (control)', () => {
    const cashier = rig.auth.login('cashier', 'Cashier123!')
    expect(() => rig.auth.loginPin(cashier.user.id, '9999')).toThrowError()
    const ok = rig.auth.loginPin(cashier.user.id, '1234')
    expect(ok.user.username).toBe('cashier')
  })
})

describe('SEC — deactivated users must lose access immediately', () => {
  it('TC-SEC-DEACT-001: hasPermission returns false immediately after deactivation', () => {
    const session = rig.auth.login('cashier', 'Cashier123!')
    expect(rig.auth.hasPermission(session.token, 'sales.create')).toBe(true)
    rig.ctx.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(session.user.id)
    expect(rig.auth.hasPermission(session.token, 'sales.create')).toBe(false)
  })
})

describe('SCOPE — cross-branch isolation', () => {
  const makeOtherBranch = () => {
    const db = rig.ctx.db
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string }
    const otherBranch = crypto.randomUUID()
    db.prepare(
      `INSERT INTO branches (id, organization_id, name, code) VALUES (?, ?, 'Other Branch', 'OTHER')`
    ).run(otherBranch, org.id)
    return otherBranch
  }

  const makeZoneTable = (branch: string) => {
    const db = rig.ctx.db
    const zone = crypto.randomUUID()
    db.prepare('INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, 0)').run(
      zone,
      branch,
      `Z-${zone.slice(0, 4)}`
    )
    const table = crypto.randomUUID()
    db.prepare(
      `INSERT INTO restaurant_tables (id, zone_id, name, capacity) VALUES (?, ?, ?, 4)`
    ).run(table, zone, `T-${table.slice(0, 4)}`)
    return table
  }

  it("TC-SCOPE-KDS-001: the kitchen board must never show another branch's tickets", () => {
    const otherBranch = makeOtherBranch()
    const tableB = makeZoneTable(otherBranch)
    // Branch B opens a table order and a branch-scoped restaurant service "sends to kitchen"
    const restaurantB = new RestaurantService(rig.ctx.db, otherBranch)
    const orderIdB = restaurantB.openTable(tableB, 2, 'seed-user')
    restaurantB.setOrderStatus(orderIdB, 'sent_to_kitchen')
    // Branch A's kitchen board must be MY branch only
    const restaurantA = new RestaurantService(rig.ctx.db, rig.branchId)
    const board = restaurantA.kitchenBoard()
    expect(board.map((t) => t.orderId)).not.toContain(orderIdB)
  })

  it("TC-SCOPE-TABLE-001: an order cannot be placed on another branch's table (cross-branch floor vandalism)", () => {
    const otherBranch = makeOtherBranch()
    const tableB = makeZoneTable(otherBranch)
    const product = rig.ctx.db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string }
    expect(() =>
      rig.orders.createOrder(
        {
          type: 'dine_in',
          tableId: tableB,
          lines: [{ productId: product.id, quantityMilli: 1000 }],
          clientOpId: crypto.randomUUID()
        },
        { userId, terminalId: 'term-local-01' }
      )
    ).toThrowError(AppError)
  })
})

describe('FSM — restaurant order state machine', () => {
  const openBillableTable = () => {
    const db = rig.ctx.db
    const zone = crypto.randomUUID()
    db.prepare('INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, 0)').run(
      zone,
      rig.branchId,
      'Main'
    )
    const table = crypto.randomUUID()
    db.prepare(
      'INSERT INTO restaurant_tables (id, zone_id, name, capacity) VALUES (?, ?, ?, 4)'
    ).run(table, zone, 'T1')
    return table
  }

  it('TC-TABLE-FSM-001: requestBill on a COMPLETED order must not reopen it', () => {
    const restaurant = new RestaurantService(rig.ctx.db, rig.branchId)
    const db = rig.ctx.db
    const registerId = (db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }).id
    rig.registers.open(registerId, 0, userId)
    const product = db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string }
    const order = rig.orders.createOrder(
      {
        type: 'dine_in',
        registerId,
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    rig.payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total, tendered: order.total }],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    expect(rig.orders.getOrder(order.id).status).toBe('completed')
    // Re-requesting a bill on the paid order must be REFUSED, not flip it back
    expect(() => restaurant.setOrderStatus(order.id, 'billed')).toThrowError(AppError)
    expect(rig.orders.getOrder(order.id).status).toBe('completed')
  })

  it('TC-TABLE-FSM-002: bumpTicket on a completed/void order is rejected', () => {
    const restaurant = new RestaurantService(rig.ctx.db, rig.branchId)
    const table = openBillableTable()
    const orderId = restaurant.openTable(table, 2, userId)
    // Empty table order; void it via closeTable
    restaurant.closeTable(table)
    expect(() => restaurant.bumpTicket(orderId)).toThrowError(AppError)
  })

  it('TC-TABLE-FSM-003: invalid status transitions are rejected', () => {
    const restaurant = new RestaurantService(rig.ctx.db, rig.branchId)
    const table = openBillableTable()
    const orderId = restaurant.openTable(table, 2, userId)
    // 'billed' straight from 'open' without kitchen flow is fine in some ops,
    // but a void order can never progress:
    restaurant.closeTable(table) // voids empty order
    expect(() => restaurant.setOrderStatus(orderId, 'served')).toThrowError(AppError)
    expect(() => restaurant.setOrderStatus(orderId, 'billed')).toThrowError(AppError)
  })
})

describe('AUDIT — attacker-visible mutations must attribute a real actor', () => {
  it('TC-AUDIT-001: table transfers / line moves audit the acting user (never NULL/system)', () => {
    const restaurant = new RestaurantService(rig.ctx.db, rig.branchId)
    const db = rig.ctx.db
    const mkTable = () => {
      const zone = crypto.randomUUID()
      db.prepare('INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, 0)').run(
        zone,
        rig.branchId,
        `Z${zone.slice(0, 3)}`
      )
      const table = crypto.randomUUID()
      db.prepare(
        'INSERT INTO restaurant_tables (id, zone_id, name, capacity) VALUES (?, ?, ?, 4)'
      ).run(table, zone, `T${table.slice(0, 3)}`)
      return table
    }
    const t1 = mkTable()
    const t2 = mkTable()
    const orderId = restaurant.openTable(t1, 2, userId)
    // These calls must accept and record the actor — currently they do not take one at all.
    restaurant.transferOrderToTable(orderId, t2, userId)
    const rows = db
      .prepare(
        `SELECT actor_id, actor_name FROM audit_log WHERE action = 'tables.transfer' AND entity_id = ?`
      )
      .all(orderId) as { actor_id: string | null; actor_name: string | null }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[rows.length - 1]!.actor_id).toBe(userId)
  })
})

describe('AUTH — gift card expiry', () => {
  it('TC-GC-EXP-001: an expired gift card cannot be redeemed', () => {
    const db = rig.ctx.db
    const registerId = (db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }).id
    rig.registers.open(registerId, 0, userId)
    const product = db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string }

    rig.customers.issueGiftCard('EXP-GC-1', 50000)
    const yesterday = new Date(Date.now() - 86400_000).toISOString()
    db.prepare('UPDATE gift_cards SET expires_at = ? WHERE code = ?').run(yesterday, 'EXP-GC-1')

    const order = rig.orders.createOrder(
      {
        type: 'retail',
        registerId,
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    // Tender the FULL total on the expired card — expiry must fire before balance moves
    expect(() =>
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'gift_card', amount: order.total, giftCardCode: 'EXP-GC-1' }],
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrowError(/expired/i)
    expect(rig.customers.getGiftCard('EXP-GC-1').balance).toBe(50000)
  })
})

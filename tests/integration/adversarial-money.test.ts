import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeRig, destroyRig, MANAGER_PIN, type TestRig } from '../helpers/rig'
import { priceOrder, type PricingLine } from '@shared/lib/pricing'
import { AppError } from '@shared/lib/errors'

/**
 * ADVERSARIAL-MONEY — attempts to break every financial invariant the way a
 * malicious or careless cashier would. Every test asserts the CORRECT
 * behavior; a failing test is a confirmed defect and gets a defect ID.
 *
 * Invariants:
 *  M1: order totals may never be negative
 *  M2: cart % discounts may never exceed 100% (and must be integer bps)
 *  M3: non-cash tenders must never be over-drawn (gift card / store credit)
 *  M4: sum(refunds for a line) must never exceed the line total
 *  M5: non-weighted items must sell in whole units
 *  M6: modifiers must belong to a group linked to the product and be active
 *  M7: expected drawer cash must equal an independent movement replay
 */

let rig: TestRig
let productId: string
let registerId: string
let userId: string

beforeEach(() => {
  rig = makeRig('advmoney')
  const db = rig.ctx.db
  userId = rig.auth.login('manager', 'Manager123!').user.id
  registerId = (db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }).id
  const unit = db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
  productId = crypto.randomUUID()
  const t = new Date().toISOString()
  db.prepare(
    `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
     VALUES (?, ?, 'Adv Product', ?, 10000, 0, 0, 1, ?, ?)`
  ).run(productId, `ADV-${productId.slice(0, 8)}`, unit.id, t, t)
})

afterEach(() => destroyRig(rig))

const makeOrder = (
  lines: Parameters<TestRig['orders']['createOrder']>[0]['lines'],
  cartDiscount?: { kind: 'percent' | 'amount'; value: number },
  customerId?: string
) =>
  rig.orders.createOrder(
    {
      type: 'retail',
      registerId,
      lines,
      cartDiscount,
      customerId,
      clientOpId: crypto.randomUUID()
    },
    { userId, terminalId: 'term-local-01' }
  )

describe('M2 — cart discount over 100% must be rejected', () => {
  it('TC-MONEY-DISC-001: a 200% percent cart discount cannot produce a negative order total', () => {
    const before = (rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    const attempt = () =>
      makeOrder([{ productId, quantityMilli: 2000 }], { kind: 'percent', value: 20000 })
    expect(attempt).toThrowError(/discount/i)
    const after = (rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    expect(after).toBe(before)
  })

  it('TC-MONEY-DISC-002: a non-integer bps percent value is a domain validation error, not a crash', () => {
    try {
      makeOrder([{ productId, quantityMilli: 1000 }], { kind: 'percent', value: 100.5 })
      expect.unreachable('accepted non-integer bps')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('VALIDATION')
    }
  })

  it('TC-MONEY-DISC-003: exactly-100% discount is legal and totals to zero (control)', () => {
    const o = makeOrder([{ productId, quantityMilli: 2000 }], { kind: 'percent', value: 10000 })
    expect(o.total).toBe(0)
    expect(o.subtotal).toBe(20000)
  })

  it('TC-MONEY-DISC-004: 100.5% discount may not create a negative total', () => {
    const before = (rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    expect(() =>
      makeOrder([{ productId, quantityMilli: 3000 }], { kind: 'percent', value: 10050 })
    ).toThrowError(/discount/i)
    const after = rig.ctx.db
      .prepare('SELECT COUNT(*) c FROM orders WHERE total < 0 OR subtotal < 0 OR tax_total < 0')
      .get() as { c: number }
    expect(after.c).toBe(0)
    expect((rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c).toBe(
      before
    )
  })
})

describe('M1 — pricing engine oracle: totals reconcile exactly under fuzz', () => {
  it('TC-MONEY-PROP-001: 10k deterministic discount allocations never drift or go negative', () => {
    let s = 42
    const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let iter = 0; iter < 10_000; iter++) {
      const n = 1 + Math.floor(rand() * 5)
      const lines: PricingLine[] = Array.from({ length: n }, () => ({
        quantityMilli: 1000 + Math.floor(rand() * 9000),
        unitPrice: Math.floor(rand() * 100_000),
        modifiersPerUnit: Math.floor(rand() * 2000),
        discountAmount: Math.floor(rand() * 5000),
        taxBps: [0, 500, 1000, 1800, 2500][Math.floor(rand() * 5)]!
      }))
      const discount =
        rand() < 0.5
          ? { kind: 'percent' as const, value: Math.floor(rand() * 10001) }
          : { kind: 'amount' as const, value: Math.floor(rand() * 20000) }
      const { lines: pl, totals } = priceOrder(lines, discount)
      const recomputed = pl.reduce((a, l) => a + l.net, 0) + pl.reduce((a, l) => a + l.tax, 0)
      expect(totals.total).toBe(recomputed)
      expect(totals.total).toBeGreaterThanOrEqual(0)
      const maxTax = lines.reduce(
        (a, l) =>
          a +
          Math.ceil(
            (l.unitPrice + l.modifiersPerUnit) * (l.quantityMilli / 1000) * (l.taxBps / 10_000)
          ),
        0
      )
      expect(totals.total).toBeLessThanOrEqual(totals.subtotal + maxTax + 2)
    }
  })
})

describe('M5 — non-weighted items must not sell fractional units', () => {
  it('TC-MONEY-QTY-001: 1.5 units of a piece item is rejected before persistence', () => {
    const before = (rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    expect(() => makeOrder([{ productId, quantityMilli: 1500 }])).toThrowError(/whole|quantity/i)
    expect((rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c).toBe(
      before
    )
  })

  it('TC-MONEY-QTY-002: fractional quantity of a weighted item is fine (control)', () => {
    const db = rig.ctx.db
    const unit = db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
    const wid = crypto.randomUUID()
    const t = new Date().toISOString()
    db.prepare(
      `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_weighted, is_active, created_at, updated_at)
       VALUES (?, ?, 'Weighted Adv', ?, 50000, 0, 0, 1, 1, ?, ?)`
    ).run(wid, `ADVW-${wid.slice(0, 8)}`, unit.id, t, t)
    const o = makeOrder([{ productId: wid, quantityMilli: 1500 }])
    expect(o.total).toBe(75000) // 1.5 × ₨500.00
  })
})

describe('M3 — non-cash over-tender must not silently burn customer funds', () => {
  it('TC-PAY-OVER-001: a gift card cannot be charged more than the outstanding total', () => {
    rig.registers.open(registerId, 0, userId)
    const order = makeOrder([{ productId, quantityMilli: 1000 }]) // total 10000
    rig.customers.issueGiftCard('ADV-GC-1', 50000)
    expect(() =>
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'gift_card', amount: 50000, giftCardCode: 'ADV-GC-1' }],
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrowError()
    expect(rig.customers.getGiftCard('ADV-GC-1').balance).toBe(50000) // untouched
    expect(rig.orders.getOrder(order.id).status).not.toBe('completed')
  })

  it('TC-PAY-OVER-002: store credit cannot be charged more than the outstanding total', () => {
    rig.registers.open(registerId, 0, userId)
    const c = rig.customers.save({ name: 'Over Tender Customer' })
    rig.customers.adjustStoreCredit(c.id, 40000, 'load')
    const order = makeOrder([{ productId, quantityMilli: 1000 }], undefined, c.id) // 10000
    expect(() =>
      rig.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'store_credit', amount: 40000 }],
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrowError()
    expect(rig.customers.get(c.id).storeCredit).toBe(40000)
  })

  it('TC-PAY-OVER-003: cash over-tender records exact change (control)', () => {
    rig.registers.open(registerId, 0, userId)
    const order = makeOrder([{ productId, quantityMilli: 1000 }])
    const done = rig.payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: 10000, tendered: 15000 }],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    expect(done.status).toBe('completed')
    expect(done.changeGiven).toBe(5000)
  })
})

describe('M6 — modifier integrity (price-tampering resistance)', () => {
  it('TC-MOD-001: an option belonging to an unlinked group cannot be applied to a product', () => {
    const db = rig.ctx.db
    const ordersBefore = (db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    const gid = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_groups (id, name, min_select, max_select, required) VALUES (?, ?, 0, 1, 0)'
    ).run(gid, 'Hack Group')
    const optId = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_options (id, group_id, name, price_delta) VALUES (?, ?, ?, ?)'
    ).run(optId, gid, 'Secret -9000.00', -900000)
    expect(() =>
      makeOrder([{ productId, quantityMilli: 1000, modifierOptionIds: [optId] }])
    ).toThrowError()
    const after = (rig.ctx.db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    expect(after).toBe(ordersBefore)
  })

  it('TC-MOD-002: an inactive modifier option cannot be applied', () => {
    const db = rig.ctx.db
    const gid = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_groups (id, name, min_select, max_select, required) VALUES (?, ?, 0, 1, 0)'
    ).run(gid, 'Linked Group')
    db.prepare('INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)').run(
      productId,
      gid
    )
    const optId = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_options (id, group_id, name, price_delta, is_active) VALUES (?, ?, ?, 500, 0)'
    ).run(optId, gid, 'Discontinued extra')
    expect(() =>
      makeOrder([{ productId, quantityMilli: 1000, modifierOptionIds: [optId] }])
    ).toThrowError()
  })

  it("TC-MOD-003: a group's max_select ceiling is enforced server-side", () => {
    const db = rig.ctx.db
    const gid = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_groups (id, name, min_select, max_select, required) VALUES (?, ?, 0, 1, 0)'
    ).run(gid, 'Toppings (max 1)')
    db.prepare('INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)').run(
      productId,
      gid
    )
    const optA = crypto.randomUUID()
    const optB = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_options (id, group_id, name, price_delta) VALUES (?, ?, ?, 100)'
    ).run(optA, gid, 'A')
    db.prepare(
      'INSERT INTO modifier_options (id, group_id, name, price_delta) VALUES (?, ?, ?, 100)'
    ).run(optB, gid, 'B')
    // Two options from a max-1 group must be rejected
    expect(() =>
      makeOrder([{ productId, quantityMilli: 1000, modifierOptionIds: [optA, optB] }])
    ).toThrowError()
    // One is fine
    const ok = makeOrder([{ productId, quantityMilli: 1000, modifierOptionIds: [optA] }])
    expect(ok.total).toBe(10100)
  })

  it('TC-MOD-004: a valid linked active modifier applies its price delta (control)', () => {
    const db = rig.ctx.db
    const gid = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_groups (id, name, min_select, max_select, required) VALUES (?, ?, 0, 1, 0)'
    ).run(gid, 'Extras')
    db.prepare('INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?, ?)').run(
      productId,
      gid
    )
    const optId = crypto.randomUUID()
    db.prepare(
      'INSERT INTO modifier_options (id, group_id, name, price_delta) VALUES (?, ?, ?, 500)'
    ).run(optId, gid, 'Extra shot')
    const o = makeOrder([{ productId, quantityMilli: 2000, modifierOptionIds: [optId] }])
    // (10000 + 500) × 2 = 21000
    expect(o.total).toBe(21000)
  })
})

describe('M4 — refund exactness and caps', () => {
  const seededLine = (unitPrice: number, quantityMilli: number, discountMinor = 0) => {
    rig.registers.open(registerId, 100000, userId)
    const db = rig.ctx.db
    const unit = db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
    const pid = crypto.randomUUID()
    const t = new Date().toISOString()
    db.prepare(
      `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
       VALUES (?, ?, 'Refund P', ?, ?, 0, 0, 1, ?, ?)`
    ).run(pid, `RFP-${pid.slice(0, 8)}`, unit.id, unitPrice, t, t)
    const order = makeOrder([{ productId: pid, quantityMilli, lineDiscountMinor: discountMinor }])
    rig.payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total, tendered: order.total }],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    return rig.orders.getOrder(order.id)
  }

  it('TC-REFUND-001: sequential partial refunds must sum EXACTLY to the line total (never more)', () => {
    // Line total 5 over qty 3000 (3 units): naive pro-ration = round(5/3) = 2 per unit ×3 = 6 > 5
    const order = seededLine(2, 3000, 1) // gross 6, discount 1 → total 5
    expect(order.total).toBe(5)
    const lineId = order.lines[0]!.id
    const refundOnce = (qty: number) =>
      rig.payments.refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: lineId, qtyMilli: qty }],
          reason: 'partial pick',
          refundMethod: 'cash',
          managerPin: MANAGER_PIN,
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    refundOnce(1000)
    refundOnce(1000)
    refundOnce(1000)
    const paid = rig.ctx.db
      .prepare('SELECT COALESCE(SUM(total),0) t FROM refunds WHERE order_id = ?')
      .get(order.id) as { t: number }
    expect(paid.t).toBe(5) // EXACTLY the line total, never 6
    expect(() => refundOnce(1000)).toThrowError()
  })

  it('TC-REFUND-002: a negative refund line hidden inside a mixed refund is rejected', () => {
    rig.registers.open(registerId, 100000, userId)
    const o2 = rig.orders.createOrder(
      {
        type: 'retail',
        registerId,
        lines: [
          { productId, quantityMilli: 1000 },
          { productId, quantityMilli: 1000 }
        ],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    rig.payments.tender(
      {
        orderId: o2.id,
        payments: [{ method: 'cash', amount: o2.total, tendered: o2.total }],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    const [a, b] = rig.orders.getOrder(o2.id).lines
    expect(() =>
      rig.payments.refund(
        {
          orderId: o2.id,
          lines: [
            { orderLineId: a!.id, qtyMilli: -999 }, // negative hidden in mixed refund
            { orderLineId: b!.id, qtyMilli: 1000 }
          ],
          reason: 'mixed exploit',
          refundMethod: 'cash',
          managerPin: MANAGER_PIN,
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrowError(AppError)
    // No corruption may have landed
    const neg = rig.ctx.db
      .prepare('SELECT COUNT(*) c FROM order_lines WHERE refunded_qty < 0')
      .get() as { c: number }
    expect(neg.c).toBe(0)
    const negMoves = rig.ctx.db
      .prepare("SELECT COUNT(*) c FROM stock_movements WHERE reason = 'refund' AND qty_delta < 0")
      .get() as { c: number }
    expect(negMoves.c).toBe(0)
  })

  it('TC-REFUND-003: 100 partial-refund slices are capped EXACTLY at the order total', () => {
    const order = seededLine(125, 8000) // total = 1000
    const lineId = order.lines[0]!.id
    let refunded = 0
    for (let i = 0; i < 100; i++) {
      try {
        rig.payments.refund(
          {
            orderId: order.id,
            lines: [{ orderLineId: lineId, qtyMilli: 100 }],
            reason: `slice ${i}`,
            refundMethod: 'cash',
            managerPin: MANAGER_PIN,
            clientOpId: crypto.randomUUID()
          },
          userId
        )
        refunded += 1
      } catch {
        break
      }
    }
    const sums = rig.ctx.db
      .prepare(
        'SELECT COALESCE(SUM(rl.amount),0) a FROM refund_lines rl JOIN refunds r ON r.id = rl.refund_id WHERE r.order_id = ?'
      )
      .get(order.id) as { a: number }
    expect(refunded).toBe(80) // 8000 milli ÷ 100-milli slices
    expect(sums.a).toBe(order.total) // exactly 1000, never 1040
  })

  it('TC-REFUND-004: refund of qty=0 is domain-rejected without side effects', () => {
    const order = seededLine(10000, 1000)
    expect(() =>
      rig.payments.refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: order.lines[0]!.id, qtyMilli: 0 }],
          reason: 'zero qty probe',
          refundMethod: 'cash',
          managerPin: MANAGER_PIN,
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrowError(AppError)
    expect((rig.ctx.db.prepare('SELECT COUNT(*) c FROM refunds').get() as { c: number }).c).toBe(0)
  })
})

describe('M7 — register expected-cash independence oracle', () => {
  it('TC-REG-001: split-tender order refunded via original tender returns only the CASH part to the drawer', () => {
    rig.registers.open(registerId, 100000, userId)
    const order = makeOrder([{ productId, quantityMilli: 1000 }]) // total 10000
    rig.payments.tender(
      {
        orderId: order.id,
        payments: [
          { method: 'cash', amount: 5000, tendered: 5000 },
          { method: 'card', amount: 5000 }
        ],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    rig.payments.refund(
      {
        orderId: order.id,
        lines: [{ orderLineId: order.lines[0]!.id, qtyMilli: 600 }],
        reason: 'partial original',
        refundMethod: 'original',
        managerPin: MANAGER_PIN,
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    const shift = rig.registers.current(registerId)!
    // 100000 opening + 5000 cash in − 5000 cash refunded (the other 1000 went back to card)
    expect(rig.registers.expectedCash(shift.id)).toBe(100000)
  })

  it('TC-REG-002: a cash-settled refund on a card-only order reduces expected cash (control)', () => {
    rig.registers.open(registerId, 100000, userId)
    const order = makeOrder([{ productId, quantityMilli: 1000 }])
    rig.payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'card', amount: 10000 }],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    rig.payments.refund(
      {
        orderId: order.id,
        lines: [{ orderLineId: order.lines[0]!.id, qtyMilli: 200 }],
        reason: 'cash-out refund',
        refundMethod: 'cash',
        managerPin: MANAGER_PIN,
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    const shift = rig.registers.current(registerId)!
    expect(rig.registers.expectedCash(shift.id)).toBe(100000 - 2000)
  })

  it(
    'TC-REG-003: refund allocation is deterministic for same-timestamp split tenders (15 iterations)',
    { timeout: 120_000 },
    () => {
      for (let i = 0; i < 15; i++) {
        const r = makeRig(`advmoney-det-${i}`)
        try {
          const db = r.ctx.db
          const uid = r.auth.login('manager', 'Manager123!').user.id
          const regId = (db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }).id
          r.registers.open(regId, 0, uid)
          const unit = db.prepare('SELECT id FROM units LIMIT 1').get() as { id: string }
          const pid = crypto.randomUUID()
          const t = new Date().toISOString()
          db.prepare(
            `INSERT INTO products (id, sku, name, unit_id, price, cost, track_stock, is_active, created_at, updated_at)
           VALUES (?, ?, 'Det P', ?, 10000, 0, 0, 1, ?, ?)`
          ).run(pid, `DTP-${pid.slice(0, 8)}`, unit.id, t, t)
          r.customers.issueGiftCard(`DET-GC-${i}`, 50000)
          const order = r.orders.createOrder(
            {
              type: 'retail',
              registerId: regId,
              lines: [{ productId: pid, quantityMilli: 1000 }], // 10000
              clientOpId: crypto.randomUUID()
            },
            { userId: uid, terminalId: 'term-local-01' }
          )
          // gift card FIRST, cash second — same timestamp ⇒ only rowid stabilizes order
          r.payments.tender(
            {
              orderId: order.id,
              payments: [
                { method: 'gift_card', amount: 5000, giftCardCode: `DET-GC-${i}` },
                { method: 'cash', amount: 5000, tendered: 5000 }
              ],
              clientOpId: crypto.randomUUID()
            },
            uid
          )
          // refund 60% to original tender
          r.payments.refund(
            {
              orderId: order.id,
              lines: [{ orderLineId: order.lines[0]!.id, qtyMilli: 600 }],
              reason: 'determinism probe',
              refundMethod: 'original',
              managerPin: MANAGER_PIN,
              clientOpId: crypto.randomUUID()
            },
            uid
          )
          // Allocation: gift card first (5000 covered), remainder 1000 to cash
          expect(r.customers.getGiftCard(`DET-GC-${i}`).balance).toBe(45000 + 5000)
          const shift = r.registers.current(regId)!
          expect(r.registers.expectedCash(shift.id)).toBe(5000 - 1000)
        } finally {
          destroyRig(r)
        }
      }
    }
  )
})

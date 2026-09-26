import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { ProductService } from '@main/services/productService'
import { execSync } from 'node:child_process'
import type { Order } from '@shared/types/models'
import type { TenderInput } from '@shared/ipc/api'

let ctx: DbContext
let auth: AuthService
let orders: OrderService
let payments: PaymentService
let products: ProductService
let branchId: string
const userId = 'seed-user'

/** Find the manager PIN that authorizes refunds (seeded: manager/1234). */
const MANAGER_PIN = '1234'

beforeAll(() => {
  execSync(`rm -f /tmp/opencode/apex/payedge-${process.pid}.db*; mkdir -p /tmp/opencode/apex`)
  ctx = openDatabase(`/tmp/opencode/apex/payedge-${process.pid}.db`)
  seedIfEmpty(ctx.db)
  branchId = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  auth = new AuthService(ctx.db)
  orders = new OrderService(ctx.db, auth, branchId)
  payments = new PaymentService(
    ctx.db,
    auth,
    branchId,
    (orderId, uid) => orders.completePayment(orderId, uid),
    (orderId) => orders.getOrder(orderId)
  )
  products = new ProductService(ctx.db, branchId)
})

afterAll(() => ctx.close())

function sale(opts: Partial<TenderInput> = {}): Order {
  const product = products.byBarcode('8961001000011')! // Rs 120
  const order = orders.createOrder(
    {
      type: 'retail',
      lines: [{ productId: product.id, quantityMilli: 1000 }],
      clientOpId: crypto.randomUUID()
    },
    { userId, terminalId: 'term-local-01' }
  )
  payments.tender(
    {
      orderId: order.id,
      payments: opts.payments ?? [{ method: 'cash', amount: order.total }],
      clientOpId: crypto.randomUUID()
    },
    userId
  )
  return orders.getOrder(order.id)
}

describe('cash tendering', () => {
  it('rejects cash tendered below the cash amount (no under-paid completion)', () => {
    const product = products.byBarcode('8961001000011')!
    const order = orders.createOrder(
      {
        type: 'retail',
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    expect(() =>
      payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total, tendered: order.total - 500 }],
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrow(/less than the cash amount/)
    // Order must remain open — no stock deducted, not completable
    expect(orders.getOrder(order.id).status).toBe('open')
  })

  it('tendered < amount on card part is still covered only if amounts sum', () => {
    const product = products.byBarcode('8961001000011')!
    const order = orders.createOrder(
      {
        type: 'retail',
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    expect(() =>
      payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'card', amount: order.total - 1 }],
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrow(/does not cover/)
  })
})

describe('refund settlement', () => {
  it('store_credit refund issues credit with a ledger entry (money is not lost)', () => {
    const customer = ctx.db.prepare('SELECT id, store_credit FROM customers LIMIT 1').get() as {
      id: string
      store_credit: number
    }
    const product = products.byBarcode('8961001000011')!
    const order = orders.createOrder(
      {
        type: 'retail',
        customerId: customer.id,
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    payments.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total }],
        clientOpId: crypto.randomUUID()
      },
      userId
    )

    const lineId = orders.getOrder(order.id).lines[0]!.id
    payments.refund(
      {
        orderId: order.id,
        lines: [{ orderLineId: lineId, qtyMilli: 1000 }],
        reason: 'Customer dissatisfied',
        refundMethod: 'store_credit',
        managerPin: MANAGER_PIN,
        clientOpId: crypto.randomUUID()
      },
      userId
    )

    const after = ctx.db
      .prepare('SELECT store_credit FROM customers WHERE id = ?')
      .get(customer.id) as { store_credit: number }
    const creditTxn = ctx.db
      .prepare(
        `SELECT * FROM store_credit_transactions
         WHERE customer_id = ? AND reason = 'refund' ORDER BY created_at DESC LIMIT 1`
      )
      .get(customer.id) as { delta: number; balance: number; ref_id: string } | undefined
    expect(creditTxn).toBeDefined()
    expect(after.store_credit).toBe(customer.store_credit + creditTxn!.delta)
    expect(creditTxn!.balance).toBe(after.store_credit)
  })

  it('partial refund keeps payment approved; full refund marks it refunded; total is tracked', () => {
    const order = sale()
    const orderLines = orders.getOrder(order.id).lines

    const makeRefund = (qtyMilli: number) =>
      payments.refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: orderLines[0]!.id, qtyMilli }],
          reason: 'Partial return',
          refundMethod: 'cash',
          managerPin: MANAGER_PIN,
          clientOpId: crypto.randomUUID()
        },
        userId
      )

    makeRefund(500) // half the line
    let pay = ctx.db
      .prepare('SELECT status, refunded_amount FROM payments WHERE order_id = ?')
      .get(order.id) as { status: string; refunded_amount: number }
    expect(pay.status).toBe('approved')
    expect(pay.refunded_amount).toBeGreaterThan(0)
    expect(pay.refunded_amount).toBeLessThan(order.total)

    makeRefund(500) // remaining half
    pay = ctx.db
      .prepare('SELECT status, refunded_amount FROM payments WHERE order_id = ?')
      .get(order.id) as { status: string; refunded_amount: number }
    expect(pay.status).toBe('refunded')
    expect(pay.refunded_amount).toBe(order.total)

    // Over-refund is impossible: the line is exhausted
    expect(() =>
      payments.refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: orderLines[0]!.id, qtyMilli: 1 }],
          reason: 'Too much',
          refundMethod: 'cash',
          managerPin: MANAGER_PIN,
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrow(/exceeds remaining/)
  })

  it('same clientOpId replay is a safe no-op', () => {
    const order = sale()
    const lineId = orders.getOrder(order.id).lines[0]!.id
    const op = crypto.randomUUID()
    const input = {
      orderId: order.id,
      lines: [{ orderLineId: lineId, qtyMilli: 1000 }],
      reason: 'Defective item',
      refundMethod: 'cash' as const,
      managerPin: MANAGER_PIN,
      clientOpId: op
    }
    payments.refund(input, userId)
    const count1 = ctx.db
      .prepare('SELECT COUNT(*) c FROM refunds WHERE order_id = ?')
      .get(order.id) as { c: number }
    payments.refund(input, userId) // replay
    const count2 = ctx.db
      .prepare('SELECT COUNT(*) c FROM refunds WHERE order_id = ?')
      .get(order.id) as { c: number }
    expect(count2.c).toBe(count1.c) // exactly one
  })

  it('original-method refund restores gift card balance without exceeding initial', () => {
    const gc = ctx.db.prepare(`SELECT * FROM gift_cards WHERE balance > 20000 LIMIT 1`).get() as {
      id: string
      code: string
      balance: number
      initial_balance: number
    }
    const balanceBefore = gc.balance

    const product = products.byBarcode('8961001000011')!
    const order = orders.createOrder(
      {
        type: 'retail',
        lines: [{ productId: product.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId, terminalId: 'term-local-01' }
    )
    const gcPart = 10000
    const cashPart = order.total - gcPart
    payments.tender(
      {
        orderId: order.id,
        payments: [
          { method: 'gift_card', amount: gcPart, giftCardCode: gc.code },
          { method: 'cash', amount: cashPart }
        ],
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    const mid = ctx.db.prepare('SELECT balance FROM gift_cards WHERE id = ?').get(gc.id) as {
      balance: number
    }
    expect(mid.balance).toBe(balanceBefore - gcPart)

    const lineId = orders.getOrder(order.id).lines[0]!.id
    payments.refund(
      {
        orderId: order.id,
        lines: [{ orderLineId: lineId, qtyMilli: 1000 }],
        reason: 'Gift card reversal',
        refundMethod: 'original',
        managerPin: MANAGER_PIN,
        clientOpId: crypto.randomUUID()
      },
      userId
    )
    const after = ctx.db.prepare('SELECT balance FROM gift_cards WHERE id = ?').get(gc.id) as {
      balance: number
    }
    expect(after.balance).toBeLessThanOrEqual(gc.initial_balance)
    // Allocation order is first-payment-first: the gift card is first, so the
    // restored amount equals min(refund total, gc part).
    expect(after.balance).toBe(mid.balance + Math.min(order.total, gcPart))
  })
})

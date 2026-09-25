import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeRig, destroyRig, type TestRig, SYSTEM_USER } from '../helpers/rig'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { PurchaseService } from '@main/services/purchaseService'
import { RegisterService } from '@main/services/registerService'
import { ProductService } from '@main/services/productService'

/**
 * MB-* — Multi-branch isolation. A second branch is created inside the same
 * database and both branches are driven through their own scoped service
 * instances. Every attempt to read/mutate the other branch's records through
 * the service/API boundary (i.e. the surface IPC exposes) must fail closed.
 */

let main: TestRig
let branchB: string
let ordersB: OrderService
let paymentsB: PaymentService
let purchasingB: PurchaseService
let registersB: RegisterService
let productsB: ProductService

beforeAll(() => {
  main = makeRig('multibranch')
  branchB = crypto.randomUUID()
  main.ctx.db
    .prepare(
      `INSERT INTO branches (id, organization_id, name, code) VALUES (?,
       (SELECT id FROM organizations LIMIT 1), 'Branch B', 'BRB')`
    )
    .run(branchB)
  // Register in branch B so shift tests have a target there.
  main.ctx.db
    .prepare(`INSERT INTO registers (id, branch_id, name, code) VALUES (?, ?, 'Register B', 'RB1')`)
    .run(crypto.randomUUID(), branchB)

  ordersB = new OrderService(main.ctx.db, main.auth, branchB, main.sync)
  paymentsB = new PaymentService(
    main.ctx.db,
    main.auth,
    branchB,
    (orderId, userId) => ordersB.completePayment(orderId, userId),
    (orderId) => ordersB.getOrder(orderId),
    main.sync
  )
  purchasingB = new PurchaseService(main.ctx.db, main.auth, branchB, undefined, main.sync)
  registersB = new RegisterService(main.ctx.db, main.auth, branchB)
  productsB = new ProductService(main.ctx.db, branchB, main.auth)
})

afterAll(() => destroyRig(main))

const anyProduct = (): { id: string } =>
  main.ctx.db.prepare(`SELECT id FROM products WHERE track_stock = 0 LIMIT 1`).get() as {
    id: string
  }

describe('MB-01 order isolation', () => {
  it('orders are invisible to other branches across every entry point', () => {
    const p = anyProduct()
    const order = ordersB.createOrder(
      {
        type: 'retail',
        lines: [{ productId: p.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId: SYSTEM_USER, terminalId: 'term-local-01' }
    )

    expect(() => main.orders.getOrder(order.id)).toThrow(/different branch/)
    expect(() => main.orders.hold(order.id, 'x', SYSTEM_USER)).toThrow(/different branch/)
    expect(() => main.orders.voidOrder(order.id, 'why', SYSTEM_USER, SYSTEM_USER)).toThrow(
      /different branch/
    )

    // Complete + pay it on the owning branch first, then refund attempts from
    // the other branch must similarly fail.
    paymentsB.tender(
      {
        orderId: order.id,
        payments: [{ method: 'cash', amount: order.total }],
        clientOpId: crypto.randomUUID()
      },
      SYSTEM_USER
    )
    const line = ordersB.getOrder(order.id).lines[0]!
    expect(() =>
      main.payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: order.total }],
          clientOpId: crypto.randomUUID()
        },
        SYSTEM_USER
      )
    ).toThrow(/different branch/)
    expect(() =>
      main.payments.refund(
        {
          orderId: order.id,
          lines: [{ orderLineId: line.id, qtyMilli: 1000 }],
          reason: 'Cross-branch refund attempt',
          refundMethod: 'cash',
          managerPin: '1234',
          clientOpId: crypto.randomUUID()
        },
        SYSTEM_USER
      )
    ).toThrow(/different branch/)
    // And the order was NOT refunded.
    expect(ordersB.getOrder(order.id).status).toBe('completed')
  })

  it('held-order lists are per branch', () => {
    const p = anyProduct()
    ordersB.createOrder(
      {
        type: 'retail',
        holdName: 'B-hold',
        lines: [{ productId: p.id, quantityMilli: 1000 }],
        clientOpId: crypto.randomUUID()
      },
      { userId: SYSTEM_USER, terminalId: 'term-local-01' }
    )
    const heldA = main.orders.listHeld().map((o) => o.holdName)
    expect(heldA).not.toContain('B-hold')
    expect(ordersB.listHeld().some((o) => o.holdName === 'B-hold')).toBe(true)
  })
})

describe('MB-02 purchasing isolation', () => {
  it('POs are branch-scoped on list/get/receive/cancel', () => {
    const supplier = (
      main.ctx.db.prepare('SELECT id FROM suppliers LIMIT 1').get() as { id: string }
    ).id
    const product = anyProduct()
    const po = purchasingB.createPO(
      { supplierId: supplier, items: [{ productId: product.id, qtyMilli: 2000, unitCost: 50000 }] },
      SYSTEM_USER
    )
    expect(main.purchasing.listPOs().some((x) => x.id === po.id)).toBe(false)
    expect(() => main.purchasing.getPO(po.id)).toThrow(/different branch/)
    purchasingB.sendPO(po.id, SYSTEM_USER)
    const lineId = purchasingB.getPO(po.id).items[0]!.id
    expect(() =>
      main.purchasing.receivePO(po.id, [{ itemId: lineId, qtyMilli: 1000 }], SYSTEM_USER, 'op-x')
    ).toThrow(/different branch/)
    expect(() => main.purchasing.cancelPO(po.id, SYSTEM_USER)).toThrow(/different branch/)
    // Untouched on the owning branch:
    expect(purchasingB.getPO(po.id).status).toBe('sent')
  })

  it('receiving in branch B adds stock only to branch B', () => {
    const supplier = (
      main.ctx.db.prepare('SELECT id FROM suppliers LIMIT 1').get() as { id: string }
    ).id
    // tracked product seeded demo: use a tracked product
    const product = main.ctx.db
      .prepare(`SELECT id FROM products WHERE track_stock = 1 LIMIT 1`)
      .get() as { id: string }
    const beforeA = main.products.onHand(product.id)
    const beforeB = productsB.onHand(product.id)

    const po = purchasingB.createPO(
      { supplierId: supplier, items: [{ productId: product.id, qtyMilli: 3000, unitCost: 40000 }] },
      SYSTEM_USER
    )
    purchasingB.sendPO(po.id, SYSTEM_USER)
    const lineId = purchasingB.getPO(po.id).items[0]!.id
    purchasingB.receivePO(po.id, [{ itemId: lineId, qtyMilli: 3000 }], SYSTEM_USER, 'op-rcv-1')

    expect(productsB.onHand(product.id)).toBe(beforeB + 3000)
    expect(main.products.onHand(product.id)).toBe(beforeA)
  })
})

describe('MB-03 register isolation', () => {
  it('open shifts do not leak across branches', () => {
    const regB = (
      main.ctx.db.prepare(`SELECT id FROM registers WHERE branch_id = ?`).get(branchB) as {
        id: string
      }
    ).id
    registersB.open(regB, 1000000, SYSTEM_USER)
    // Branch A must not see it
    expect(main.registers.listOpen().length).toBe(0)
    expect(registersB.listOpen().length).toBe(1)
    // And closing from branch A cannot touch B's shift (the IPC layer filters
    // by session branch; the same guard must hold at the service boundary).
    expect(() => main.registers.close(regB, 0, SYSTEM_USER)).toThrow()
    registersB.close(regB, 1000000, SYSTEM_USER)
  })
})

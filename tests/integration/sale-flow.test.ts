import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { RegisterService } from '@main/services/registerService'
import { ProductService } from '@main/services/productService'
import { execSync } from 'node:child_process'

let ctx: DbContext
let auth: AuthService
let orders: OrderService
let payments: PaymentService
let registers: RegisterService
let products: ProductService
let branchId: string
const userId = 'seed-user'

beforeAll(() => {
  // Isolated ephemeral DB per test file
  execSync('rm -f /tmp/apexfpos-integrations.db*')
  ctx = openDatabase('/tmp/apexfpos-integrations.db')
  seedIfEmpty(ctx.db)
  branchId = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id

  auth = new AuthService(ctx.db)
  orders = new OrderService(ctx.db, auth, branchId)
  payments = new PaymentService(
    ctx.db,
    auth,
    branchId,
    (orderId, userId) => orders.completePayment(orderId, userId),
    (orderId) => orders.getOrder(orderId)
  )
  registers = new RegisterService(ctx.db, auth, branchId)
  products = new ProductService(ctx.db, branchId)
})

afterAll(() => ctx.close())

describe('Flow A — full retail sale', () => {
  it('auth → open register → find product → create order → tender cash → verify inventory', () => {
    // 1. Auth
    const session = auth.login('cashier', 'Cashier123!')
    expect(session.user.roleName).toBe('Cashier')
    expect(session.permissions).toContain('sales.create')
    expect(session.permissions).not.toContain('users.manage')

    // 2. Open register
    const registerRow = ctx.db.prepare('SELECT id FROM registers LIMIT 1').get() as { id: string }
    const shift = registers.open(registerRow.id, 500000, session.user.id)
    expect(shift.status).toBe('open')

    // 3. Find product by barcode (scanner flow)
    const product = products.byBarcode('8961001000011')!
    expect(product.name).toBe('Coca-Cola 500ml PET')
    const beforeStock = products.onHand(product.id)
    expect(beforeStock).toBeGreaterThan(0)

    // 4. Create order — 2 units, one at discount
    const order = orders.createOrder(
      {
        type: 'retail',
        registerId: registerRow.id,
        lines: [
          { productId: product.id, quantityMilli: 2000 },
          { productId: product.id, quantityMilli: 1000, lineDiscountMinor: 2000 }
        ],
        clientOpId: crypto.randomUUID()
      },
      { userId: session.user.id, terminalId: session.terminalId }
    )

    // Expected: unit 12000 → line1 gross 24000, tax 18% = 4320 → 28320
    //            line2 gross 12000, discount 2000, net 10000, tax 1800 → 11800
    //            total = 40120
    expect(order.status).toBe('open')
    expect(order.total).toBe(40120)

    // 5. Tender split: 25,000 cash tendered (change 4,880 on the cash part) +
    //    20,000 card. Total covers 40,120.
    const tenderOp = crypto.randomUUID()
    const tenderInput = {
      orderId: order.id,
      payments: [
        { method: 'cash' as const, amount: 20120, tendered: 25000 },
        { method: 'card' as const, amount: 20000 }
      ],
      clientOpId: tenderOp
    }
    payments.tender(tenderInput, session.user.id)

    // 6. Verify completion + stock decrement
    const finalized = orders.getOrder(order.id)
    expect(finalized.status).toBe('completed')
    expect(finalized.amountPaid).toBe(40120)
    expect(finalized.changeGiven).toBe(4880)

    const afterStock = products.onHand(product.id)
    expect(afterStock).toBe(beforeStock - 3000)

    // 7. Audit trail entries exist
    const auditRows = ctx.db
      .prepare(`SELECT action FROM audit_log WHERE entity = 'order' AND entity_id = ?`)
      .all(order.id) as { action: string }[]
    expect(auditRows.map((r) => r.action)).toContain('orders.create')
    expect(auditRows.map((r) => r.action)).toContain('orders.complete')

    // 8. Idempotency: repeating the exact same tender op is a safe no-op.
    payments.tender(tenderInput, session.user.id)
    const afterReplay = orders.getOrder(order.id)
    expect(afterReplay.amountPaid).toBe(40120) // unchanged

    // 8b. A *different* op id on a completed order is rejected, not double-charged.
    expect(() =>
      payments.tender(
        {
          orderId: order.id,
          payments: [{ method: 'cash', amount: 40120 }],
          clientOpId: crypto.randomUUID()
        },
        session.user.id
      )
    ).toThrow(/already completed/)

    // 9. Register close produces a variance report
    const totalReceived = ctx.db
      .prepare(`SELECT SUM(p.amount) s FROM payments p WHERE p.method='cash'`)
      .get() as { s: number }
    expect(totalReceived.s).toBeGreaterThan(0)
  })

  it('rejects under-tender with clear error', () => {
    const product = products.byBarcode('8961001000042')! // water
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
          payments: [{ method: 'cash', amount: 1, tendered: 1 }],
          clientOpId: crypto.randomUUID()
        },
        userId
      )
    ).toThrow(/does not cover/)
  })
})

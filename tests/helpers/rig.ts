import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { AuthService } from '@main/services/authService'
import { OrderService } from '@main/services/orderService'
import { PaymentService } from '@main/services/paymentService'
import { ProductService } from '@main/services/productService'
import { PurchaseService } from '@main/services/purchaseService'
import { RegisterService } from '@main/services/registerService'
import { CustomerService } from '@main/services/customerService'
import { SyncService } from '@main/services/syncService'

export const TMP_ROOT = '/tmp/opencode/apex'

export interface TestRig {
  path: string
  ctx: DbContext
  branchId: string
  auth: AuthService
  orders: OrderService
  payments: PaymentService
  products: ProductService
  purchasing: PurchaseService
  registers: RegisterService
  customers: CustomerService
  sync: SyncService
}

let seq = 0

/**
 * Open a fresh, seeded database backed by a disposable file under
 * /tmp/opencode. Every service is wired exactly as in production boot
 * (src/main/index.ts), including the sync outbox.
 */
export const makeRig = (label = 'suite'): TestRig => {
  const dir = join(TMP_ROOT, `${label}-${process.pid}-${seq++}`)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'apexpos.db')
  const ctx = openDatabase(path)
  seedIfEmpty(ctx.db)
  const branchId = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  const auth = new AuthService(ctx.db)
  const sync = new SyncService(ctx.db)
  const orders = new OrderService(ctx.db, auth, branchId, sync)
  const payments = new PaymentService(
    ctx.db,
    auth,
    branchId,
    (orderId, userId) => orders.completePayment(orderId, userId),
    (orderId) => orders.getOrder(orderId),
    sync
  )
  return {
    path,
    ctx,
    branchId,
    auth,
    orders,
    payments,
    products: new ProductService(ctx.db, branchId, auth),
    purchasing: new PurchaseService(ctx.db, auth, branchId, undefined, sync),
    registers: new RegisterService(ctx.db, auth, branchId),
    customers: new CustomerService(ctx.db),
    sync
  }
}

export const destroyRig = (rig: TestRig): void => {
  rig.ctx.close()
  rmSync(join(rig.path, '..'), { recursive: true, force: true })
}

export const MANAGER_PIN = '1234'
export const SYSTEM_USER = 'seed-user'

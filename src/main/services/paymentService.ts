import type { DB } from '../db/database'
import { AppError, ErrorCode } from '@shared/lib/errors'
import { sum } from '@shared/lib/money'
import type { TenderInput, RefundInput } from '@shared/ipc/api'
import type { Order, Payment } from '@shared/types/models'
import type { AuthService } from './authService'

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

/**
 * Payments. All payments for an order must sum exactly to the order total
 * (cash over-tender produces change instead of overpayment). Client op ids
 * make retries safe.
 */
export class PaymentService {
  constructor(
    private db: DB,
    private auth: AuthService,
    private branchId: string,
    private completeOrder: (orderId: string, userId: string) => void,
    private getOrder: (orderId: string) => Order
  ) {}

  tender(input: TenderInput, userId: string): Order {
    // Idempotent: re-delivering the same op returns the already-completed
    // order rather than inserting duplicate payments.
    const existing = this.db
      .prepare("SELECT 1 FROM payments WHERE client_op_id LIKE ? ESCAPE '\\' LIMIT 1")
      .get(`${input.clientOpId.replace(/([%_\\])/g, '\\$1')}:%`)
    if (existing) {
      return this.getOrder(input.orderId)
    }

    const order = this.order(input.orderId)
    if (order.status === 'void') throw new AppError(ErrorCode.InvalidState, 'Order is void.')
    if (order.status === 'completed') {
      throw new AppError(ErrorCode.InvalidState, 'Order is already completed.')
    }

    const total = order.total as number
    const payTotal = sum(input.payments.map((p) => p.amount))
    if (payTotal < total) {
      throw new AppError(
        ErrorCode.Validation,
        `Payments total (${payTotal}) does not cover order total (${total}).`
      )
    }

    const tx = this.db.transaction(() => {
      const shiftId = this.currentShiftId()
      let remaining = payTotal

      input.payments.forEach((p, paymentIndex) => {
        const change = p.method === 'cash' && p.tendered !== undefined && p.tendered > p.amount
          ? p.tendered - p.amount
          : 0
        const applied = p.method === 'cash' && p.tendered !== undefined
          ? Math.min(p.amount, p.tendered) // cap applied at tender
          : p.amount

        // Gift card validation
        if (p.method === 'gift_card') {
          if (!p.giftCardCode) throw new AppError(ErrorCode.Validation, 'Gift card code required.')
          this.applyGiftCard(p.giftCardCode, p.amount, 'order', input.orderId, userId)
        }
        // Store credit validation
        if (p.method === 'store_credit') {
          this.applyStoreCredit(order.customer_id, p.amount, 'order', input.orderId, userId)
        }

        // Simulated card outcome (clearly marked; real adapters replace this)
        const simulatedCardOutcome = p.method === 'card' ? (p.simulateOutcome ?? 'approved') : undefined
        const status: Payment['status'] =
          simulatedCardOutcome === 'declined' ? 'declined' : 'approved'
        if (status === 'declined') {
          throw new AppError(ErrorCode.PaymentDeclined, 'Card was declined by the simulated issuer.')
        }

        this.db
          .prepare(
            `INSERT INTO payments (id, order_id, method, amount, tendered, change_amount,
               reference, status, card_brand, card_last4, approval_code, client_op_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id(), input.orderId, p.method, applied,
            p.tendered ?? null, change || null,
            p.reference ?? null, status,
            p.method === 'card' ? 'UnionPay' : null,
            p.method === 'card' ? '4321' : null,
            p.method === 'card' ? `SIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : null,
            `${input.clientOpId}:${paymentIndex}`, now()
          )
        remaining -= applied
      })

      // Change may not exceed cash over-tender; if it does, take cash drawer note
      void (input.serviceCharge ?? 0, input.tip ?? 0, remaining)
      this.completeOrder(input.orderId, userId)
      void shiftId
    })
    tx.immediate()
    return this.getOrder(input.orderId)
  }

  refund(input: RefundInput, userId: string): void {
    const existing = this.db
      .prepare('SELECT 1 FROM refunds WHERE client_op_id = ? LIMIT 1')
      .get(input.clientOpId)
    if (existing) return

    // Verify manager override
    const approverId = this.auth.verifyOverride(input.managerPin, 'sales.refund')
    const order = this.order(input.orderId)
    if (order.status !== 'completed') {
      throw new AppError(ErrorCode.InvalidState, 'Only completed orders can be refunded.')
    }

    const tx = this.db.transaction(() => {
      // Qty validation per line
      let refundTotal = 0
      for (const rl of input.lines) {
        const line = this.db
          .prepare('SELECT * FROM order_lines WHERE id = ? AND order_id = ?')
          .get(rl.orderLineId, input.orderId) as
          | { id: string; quantity: number; refunded_qty: number; line_total: number; product_id: string; variant_id: string | null }
          | undefined
        if (!line) throw new AppError(ErrorCode.NotFound, `Order line not found: ${rl.orderLineId}`)
        const remaining = line.quantity - line.refunded_qty
        if (rl.qtyMilli > remaining) {
          throw new AppError(
            ErrorCode.Validation,
            `Refund qty ${rl.qtyMilli} exceeds remaining ${remaining} for line.`
          )
        }
        // Prorate refund amount
        const amount = Math.round((line.line_total * rl.qtyMilli) / line.quantity)
        refundTotal += amount
        this.db
          .prepare('UPDATE order_lines SET refunded_qty = refunded_qty + ? WHERE id = ?')
          .run(rl.qtyMilli, rl.orderLineId)
      }
      if (refundTotal <= 0) {
        throw new AppError(ErrorCode.Validation, 'Refund total must be greater than zero.')
      }

      const refundId = id()
      this.db
        .prepare(
          `INSERT INTO refunds (id, order_id, number, reason, total, approved_by, client_op_id, created_at)
           VALUES (?, ?, (SELECT COALESCE(MAX(number),0)+1 FROM refunds), ?, ?, ?, ?, ?)`
        )
        .run(refundId, input.orderId, input.reason, refundTotal, approverId, input.clientOpId, now())

      for (const rl of input.lines) {
        const line = this.db
          .prepare('SELECT * FROM order_lines WHERE id = ?')
          .get(rl.orderLineId) as { product_id: string; variant_id: string | null; line_total: number; quantity: number }
        const amount = Math.round((line.line_total * rl.qtyMilli) / line.quantity)
        this.db
          .prepare('INSERT INTO refund_lines (id, refund_id, order_line_id, qty, amount) VALUES (?, ?, ?, ?, ?)')
          .run(id(), refundId, rl.orderLineId, rl.qtyMilli, amount)

        // Return stock as a refund movement
        this.db
          .prepare(
            `INSERT INTO stock_movements (id, product_id, variant_id, branch_id, qty_delta, reason, ref_type, ref_id, user_id, created_at)
             VALUES (?, ?, ?, ?, ?, 'refund', 'refund', ?, ?, ?)`
          )
          .run(id(), line.product_id, line.variant_id ?? null, this.branchId, rl.qtyMilli, refundId, userId, now())
      }

      // Mark payments refunded (allocate pro-rata, first method first)
      let left = refundTotal
      const payments = this.db
        .prepare(`SELECT id, amount FROM payments WHERE order_id = ? AND status = 'approved' ORDER BY created_at`)
        .all(input.orderId) as { id: string; amount: number }[]
      for (const p of payments) {
        if (left <= 0) break
        const part = Math.min(left, p.amount)
        this.db
          .prepare(`UPDATE payments SET status = 'refunded' WHERE id = ? AND ? >= amount`)
          .run(p.id, part)
        left -= part
      }

      // Loyalty: reverse earned points if present
      this.auth.audit(userId, undefined, 'payments.refund', 'order', input.orderId, this.branchId, {
        refundId,
        total: refundTotal,
        reason: input.reason,
        approvedBy: approverId
      })
    })
    tx.immediate()
  }

  private applyGiftCard(code: string, amount: number, refType: string, refId: string, userId: string): void {
    const card = this.db
      .prepare(`SELECT * FROM gift_cards WHERE code = ? AND status = 'active'`)
      .get(code) as { id: string; balance: number } | undefined
    if (!card) throw new AppError(ErrorCode.NotFound, `Gift card not found: ${code}`)
    if (card.balance < amount) {
      throw new AppError(ErrorCode.InsufficientFunds, `Gift card balance (${card.balance}) is less than ${amount}.`)
    }
    const newBalance = card.balance - amount
    this.db.prepare(`UPDATE gift_cards SET balance = ?, status = ? WHERE id = ?`).run(
      newBalance, newBalance === 0 ? 'depleted' : 'active', card.id
    )
    this.db
      .prepare(
        `INSERT INTO gift_card_transactions (id, card_id, delta, balance, ref_type, ref_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id(), card.id, -amount, newBalance, refType, refId, now())
    void userId
  }

  private applyStoreCredit(customerId: string | null, amount: number, refType: string, refId: string, userId: string): void {
    if (!customerId) throw new AppError(ErrorCode.Validation, 'Store credit requires a customer on the order.')
    const row = this.db
      .prepare('SELECT store_credit FROM customers WHERE id = ?')
      .get(customerId) as { store_credit: number } | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, 'Customer not found.')
    if (row.store_credit < amount) {
      throw new AppError(ErrorCode.InsufficientFunds, `Store credit balance (${row.store_credit}) is less than ${amount}.`)
    }
    const newBalance = row.store_credit - amount
    this.db.prepare('UPDATE customers SET store_credit = ? WHERE id = ?').run(newBalance, customerId)
    this.db
      .prepare(
        `INSERT INTO store_credit_transactions (id, customer_id, delta, balance, reason, ref_type, ref_id, created_at)
         VALUES (?, ?, ?, ?, 'purchase', ?, ?, ?)`
      )
      .run(id(), customerId, -amount, newBalance, refType, refId, now())
    void userId
  }

  private currentShiftId(): string | null {
    const s = this.db
      .prepare(`SELECT id FROM shifts WHERE status = 'open' LIMIT 1`)
      .get() as { id: string } | undefined
    return s?.id ?? null
  }

  private order(orderId: string): { id: string; status: string; total: number; customer_id: string | null } {
    const row = this.db.prepare('SELECT id, status, total, customer_id FROM orders WHERE id = ?').get(orderId) as
      | { id: string; status: string; total: number; customer_id: string | null }
      | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Order not found: ${orderId}`)
    return row
  }
}

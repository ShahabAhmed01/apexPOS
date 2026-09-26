import type { DB } from '../db/database'
import { AppError, ErrorCode, isUniqueViolation } from '@shared/lib/errors'
import { priceOrder, type PricingLine } from '@shared/lib/pricing'
import type { Order, OrderLine, OrderLineModifier, OrderType } from '@shared/types/models'
import type { AuthService } from './authService'
import type { SyncService } from './syncService'
import type { CartLineInput, CreateOrderInput } from '@shared/ipc/api'
import type { Money } from '@shared/lib/money'

interface ProductRow {
  id: string
  name: string
  sku: string
  price: number
  cost: number
  tax_id: string | null
  track_stock: number
  is_weighted: number
}

interface LinePricing extends PricingLine {
  product: ProductRow
  modifierOptions: ModifierOptionRow[]
}

interface ModifierOptionRow {
  id: string
  group_id: string
  name: string
  price_delta: number
  is_active: number
}

interface LineResult {
  input: CartLineInput
  product: ProductRow
  /** Validated modifier options (linked groups, active, within select limits). */
  modifierOptions: ModifierOptionRow[]
  gross: Money
  discount: Money
  net: Money
  tax: Money
  lineTotal: Money
}

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

interface OrderRow {
  id: string
  branch_id: string
  number: number
  number_label: string
  type: string
  status: string
  register_id: string | null
  terminal_id: string
  shift_id: string | null
  user_id: string
  customer_id: string | null
  table_id: string | null
  subtotal: number
  discount_total: number
  tax_total: number
  service_charge: number
  tip: number
  rounding_adjustment: number
  total: number
  hold_name: string | null
  created_at: string
  completed_at: string | null
  voided_at: string | null
  void_reason: string | null
  void_approved_by: string | null
}

interface LineRow {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  sku: string
  name: string
  quantity: number
  unit_price: number
  line_discount: number
  tax_bps: number
  tax_amount: number
  line_total: number
  kitchen_station: string | null
  course: string | null
  seat: number | null
  notes: string | null
  allergy_flag: number
  status: string
  refunded_qty: number
  sort_order: number
}

/** Row of `order_line_modifiers` — modifiers hang off lines, not orders. */
interface ModifierRow {
  id: string
  order_line_id: string
  modifier_option_id: string
  name: string
  price_delta: number
}

export class OrderService {
  constructor(
    private db: DB,
    private auth: AuthService,
    private branchId: string,
    private sync?: SyncService
  ) {}

  /**
   * Create a new order. Idempotent via clientOpId — the same key returns the
   * previously created order instead of duplicating.
   */
  createOrder(input: CreateOrderInput, session: { userId: string; terminalId: string }): Order {
    // Idempotency short-circuit
    const existing = this.db
      .prepare('SELECT id FROM orders WHERE client_op_id = ?')
      .get(input.clientOpId) as { id: string } | undefined
    if (existing) return this.getOrder(existing.id)

    // Referential integrity + branch scope for optional references
    if (input.registerId) {
      const reg = this.db
        .prepare('SELECT 1 FROM registers WHERE id = ? AND branch_id = ? AND is_active = 1')
        .get(input.registerId, this.branchId)
      if (!reg) throw new AppError(ErrorCode.NotFound, `Register not found: ${input.registerId}`)
    }
    if (input.customerId) {
      const cust = this.db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
      if (!cust) throw new AppError(ErrorCode.NotFound, `Customer not found: ${input.customerId}`)
    }
    if (input.tableId) {
      const t = this.db
        .prepare(
          'SELECT z.branch_id FROM restaurant_tables t JOIN zones z ON z.id = t.zone_id WHERE t.id = ?'
        )
        .get(input.tableId) as { branch_id: string } | undefined
      if (!t) throw new AppError(ErrorCode.NotFound, `Table not found: ${input.tableId}`)
      if (t.branch_id !== this.branchId) {
        throw new AppError(ErrorCode.Forbidden, 'Table belongs to a different branch.')
      }
    }

    const { lines, totals } = this.priceLines(input.lines, input.cartDiscount, {
      serviceCharge: 0,
      tip: input.tip ?? 0
    })

    const orderId = id()
    const t = now()

    const insertTx = (): void => {
      const tx = this.db.transaction(() => {
        const number = this.nextOrderNumber()
        this.db
          .prepare(
            `INSERT INTO orders (
              id, branch_id, number, number_label, type, status, register_id, terminal_id,
              shift_id, user_id, customer_id, table_id,
              subtotal, discount_total, tax_total, service_charge, tip, rounding_adjustment, total,
              hold_name, client_op_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
          )
          .run(
            orderId,
            this.branchId,
            number.number,
            number.label,
            input.type,
            input.holdName ? 'held' : 'open',
            input.registerId ?? null,
            session.terminalId,
            this.currentShiftId() ?? null,
            session.userId,
            input.customerId ?? null,
            input.tableId ?? null,
            totals.subtotal,
            totals.lineDiscountTotal + totals.cartDiscount,
            totals.taxTotal,
            totals.serviceCharge,
            totals.tip,
            totals.total,
            input.holdName ?? null,
            input.clientOpId,
            t
          )

        this.insertLines(orderId, lines)
        if (input.tableId) this.markTable(input.tableId, 'seated')
        this.sync?.enqueue(`order:${input.clientOpId}`, 'order', orderId, 'create', {
          number: number.number,
          numberLabel: number.label,
          type: input.type,
          total: totals.total,
          branchId: this.branchId
        })
        this.auth.audit(
          session.userId,
          undefined,
          'orders.create',
          'order',
          orderId,
          this.branchId,
          {
            type: input.type,
            total: totals.total,
            lines: input.lines.length
          }
        )
        return orderId
      })
      tx.immediate()
    }

    try {
      insertTx()
    } catch (e) {
      // Concurrent replay of the same clientOpId: the UNIQUE constraint fired;
      // return the winner's order instead of surfacing a spurious failure.
      if (isUniqueViolation(e)) {
        const winner = this.db
          .prepare('SELECT id FROM orders WHERE client_op_id = ?')
          .get(input.clientOpId) as { id: string } | undefined
        if (winner) return this.getOrder(winner.id)
      }
      throw e
    }
    return this.getOrder(orderId)
  }

  /** Add / modify lines on an open order (restaurant re-order or corrections pre-payment). */
  updateDraft(orderId: string, input: CreateOrderInput, session: { userId: string }): Order {
    const order = this.row(orderId)
    if (['completed', 'void'].includes(order.status)) {
      throw new AppError(ErrorCode.InvalidState, `Order is ${order.status} and cannot be modified.`)
    }
    const { lines, totals } = this.priceLines(input.lines, input.cartDiscount, {
      tip: input.tip ?? 0
    })
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM order_lines WHERE order_id = ?').run(orderId)
      this.insertLines(orderId, lines)
      this.db
        .prepare(
          `UPDATE orders SET subtotal=?, discount_total=?, tax_total=?, service_charge=?,
           tip=?, total=?, version=version+1 WHERE id=?`
        )
        .run(
          totals.subtotal,
          totals.lineDiscountTotal + totals.cartDiscount,
          totals.taxTotal,
          totals.serviceCharge,
          totals.tip,
          totals.total,
          orderId
        )
      this.auth.audit(session.userId, undefined, 'orders.update', 'order', orderId, this.branchId)
    })
    tx.immediate()
    return this.getOrder(orderId)
  }

  hold(orderId: string, holdName: string | undefined, userId: string): Order {
    const o = this.row(orderId)
    if (o.status === 'completed' || o.status === 'void') {
      throw new AppError(ErrorCode.InvalidState, 'Cannot hold a closed order.')
    }
    this.db
      .prepare(
        `UPDATE orders SET status = 'held', hold_name = ?, version = version + 1 WHERE id = ?`
      )
      .run(holdName ?? `Hold #${o.number}`, orderId)
    this.auth.audit(userId, undefined, 'orders.hold', 'order', orderId, this.branchId)
    return this.getOrder(orderId)
  }

  recall(orderId: string, userId: string): Order {
    const o = this.row(orderId)
    if (o.status !== 'held') {
      throw new AppError(
        ErrorCode.InvalidState,
        `Order is ${o.status}; only held orders can be recalled.`
      )
    }
    this.db
      .prepare(`UPDATE orders SET status = 'open', version = version + 1 WHERE id = ?`)
      .run(orderId)
    this.auth.audit(userId, undefined, 'orders.recall', 'order', orderId, this.branchId)
    return this.getOrder(orderId)
  }

  voidOrder(orderId: string, reason: string, approverId: string, userId: string): void {
    const o = this.row(orderId)
    if (o.status === 'completed') {
      throw new AppError(
        ErrorCode.InvalidState,
        'Completed orders cannot be voided; process a refund.'
      )
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE orders SET status = 'void', voided_at = ?, void_reason = ?, void_approved_by = ?, version = version + 1
           WHERE id = ?`
        )
        .run(now(), reason, approverId, orderId)
      if (o.table_id) this.markTable(o.table_id, 'free')
      this.auth.audit(userId, undefined, 'orders.void', 'order', orderId, this.branchId, {
        reason,
        approvedBy: approverId
      })
    })
    tx.immediate()
  }

  listHeld(): Order[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM orders WHERE status = 'held' AND branch_id = ? ORDER BY created_at DESC`
      )
      .all(this.branchId) as OrderRow[]
    return rows.map((r) => this.toOrder(r, this.getLines(r.id), this.getModifiers(r.id)))
  }

  private getLines(orderId: string): LineRow[] {
    return this.db
      .prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY sort_order, rowid')
      .all(orderId) as LineRow[]
  }

  private getModifiers(orderId: string): ModifierRow[] {
    const lineIds = this.db
      .prepare('SELECT id FROM order_lines WHERE order_id = ?')
      .all(orderId) as { id: string }[]
    if (lineIds.length === 0) return []
    const placeholders = lineIds.map(() => '?').join(',')
    return this.db
      .prepare(`SELECT * FROM order_line_modifiers WHERE order_line_id IN (${placeholders})`)
      .all(...lineIds.map((l) => l.id)) as ModifierRow[]
  }

  getOrder(orderId: string): Order {
    const order = this.row(orderId)
    const lines = this.db
      .prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY sort_order, rowid')
      .all(orderId) as LineRow[]
    const lineIds = lines.map((l) => l.id)
    const modifiers = lineIds.length
      ? (this.db
          .prepare(
            `SELECT * FROM order_line_modifiers
             WHERE order_line_id IN (${lineIds.map(() => '?').join(',')})`
          )
          .all(...lineIds) as {
          id: string
          order_line_id: string
          modifier_option_id: string
          name: string
          price_delta: number
        }[])
      : []
    return this.toOrder(order, lines, modifiers)
  }

  /** Called by PaymentsService once an order is fully paid. Updates stock + table. */
  completePayment(orderId: string, userId: string): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE orders SET status = 'completed', completed_at = ?, version = version + 1 WHERE id = ?`
        )
        .run(now(), orderId)
      if (this.row(orderId).table_id) {
        this.markTable(this.row(orderId).table_id!, 'free')
      }
      this.assertStockAvailable(orderId)
      this.deductStock(orderId, userId)
      this.auth.audit(userId, undefined, 'orders.complete', 'order', orderId, this.branchId)
    })
    tx.immediate()
  }

  /**
   * Stock policy. When `allowNegativeStock` is off (the default), completing a
   * sale that would drive a tracked product below zero fails the whole tender
   * transaction — the order, payments and ledgers are left untouched.
   */
  private assertStockAvailable(orderId: string): void {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('app.pos') as
      { value: string } | undefined
    const allowNegative = row
      ? ((JSON.parse(row.value) as { allowNegativeStock?: boolean }).allowNegativeStock ?? false)
      : false
    if (allowNegative) return

    const lines = this.db
      .prepare(
        `SELECT ol.product_id, ol.variant_id, ol.name, SUM(ol.quantity) AS q, p.track_stock
         FROM order_lines ol JOIN products p ON p.id = ol.product_id
         WHERE ol.order_id = ?
         GROUP BY ol.product_id, ol.variant_id`
      )
      .all(orderId) as {
      product_id: string
      variant_id: string | null
      name: string
      q: number
      track_stock: number
    }[]

    for (const l of lines) {
      if (l.track_stock !== 1) continue
      const onHand = (
        this.db
          .prepare(
            `SELECT COALESCE(SUM(qty_delta), 0) AS q FROM stock_movements
             WHERE product_id = ? AND branch_id = ?
               AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))`
          )
          .get(l.product_id, this.branchId, l.variant_id, l.variant_id) as { q: number }
      ).q
      if (onHand - l.q < 0) {
        throw new AppError(
          ErrorCode.Validation,
          `Insufficient stock for "${l.name}": on hand ${l.track_stock === 1 ? onHand / 1000 : '—'}, required ${l.q / 1000}.`
        )
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private priceLines(
    inputLines: CartLineInput[],
    cartDiscount: CreateOrderInput['cartDiscount'],
    opts: { serviceCharge?: number; tip?: number }
  ): { lines: LineResult[]; totals: ReturnType<typeof priceOrder>['totals'] } {
    const pricingLines: LinePricing[] = inputLines.map((input) => {
      if (!Number.isInteger(input.quantityMilli) || input.quantityMilli <= 0) {
        throw new AppError(ErrorCode.Validation, 'Line quantity must be a positive integer.')
      }
      if (input.quantityMilli > 10_000_000) {
        throw new AppError(ErrorCode.Validation, 'Line quantity exceeds the supported maximum.')
      }
      const product = this.db
        .prepare(
          'SELECT id, name, sku, price, cost, tax_id, track_stock, is_weighted FROM products WHERE id = ?'
        )
        .get(input.productId) as ProductRow | undefined
      if (!product) throw new AppError(ErrorCode.NotFound, `Product not found: ${input.productId}`)
      if (!product.is_weighted && input.quantityMilli % 1000 !== 0) {
        throw new AppError(
          ErrorCode.Validation,
          `"${product.name}" is sold per whole unit; quantity ${input.quantityMilli / 1000} is invalid.`
        )
      }

      // Variants must belong to the product being sold.
      if (input.variantId) {
        const variant = this.db
          .prepare(
            'SELECT id FROM product_variants WHERE id = ? AND product_id = ? AND is_active = 1'
          )
          .get(input.variantId, product.id) as { id: string } | undefined
        if (!variant) {
          throw new AppError(ErrorCode.NotFound, `Variant not found: ${input.variantId}`)
        }
      }

      let taxBps = 0
      if (product.tax_id) {
        const t = this.db.prepare('SELECT rate_bps FROM taxes WHERE id = ?').get(product.tax_id) as
          { rate_bps: number } | undefined
        taxBps = t?.rate_bps ?? 0
      }

      const modifierOptions = this.validateModifiers(product, input)

      const unitPrice = input.unitPriceOverride ?? product.price
      if (!Number.isInteger(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000_000) {
        throw new AppError(ErrorCode.Validation, `Unit price out of range for "${product.name}".`)
      }
      const lineDiscount = input.lineDiscountMinor ?? 0
      if (!Number.isInteger(lineDiscount) || lineDiscount < 0 || lineDiscount > 1_000_000_000) {
        throw new AppError(ErrorCode.Validation, 'Line discount out of range.')
      }

      return {
        product,
        modifierOptions,
        quantityMilli: input.quantityMilli,
        unitPrice,
        modifiersPerUnit: modifierOptions.reduce((a, o) => a + o.price_delta, 0),
        discountAmount: lineDiscount,
        taxBps
      }
    })

    const totalsBundle = priceOrder(pricingLines, cartDiscount ?? null, {
      serviceCharge: opts.serviceCharge,
      tip: opts.tip
    })

    return {
      lines: inputLines.map((input, i) => ({
        input,
        product: pricingLines[i]!.product,
        modifierOptions: pricingLines[i]!.modifierOptions,
        gross: totalsBundle.lines[i]!.gross,
        discount: totalsBundle.lines[i]!.discount,
        net: totalsBundle.lines[i]!.net,
        tax: totalsBundle.lines[i]!.tax,
        lineTotal: totalsBundle.lines[i]!.lineTotal
      })),
      totals: totalsBundle.totals
    }
  }

  /**
   * Modifier integrity: every option must (a) exist, (b) be active, and
   * (c) belong to a modifier group linked to the product; each linked group's
   * min/max select counts are enforced. Anything else is a price-tampering
   * attempt and is rejected.
   */
  private validateModifiers(product: ProductRow, input: CartLineInput): ModifierOptionRow[] {
    const requested = input.modifierOptionIds ?? []
    const optStmt = this.db.prepare(
      `SELECT id, group_id, name, price_delta, is_active FROM modifier_options WHERE id = ?`
    )
    const linkStmt = this.db.prepare(
      'SELECT 1 FROM product_modifier_groups WHERE product_id = ? AND group_id = ? LIMIT 1'
    )
    const chosen: ModifierOptionRow[] = []
    const chosenGroups = new Map<string, number>()
    for (const optId of requested) {
      const opt = optStmt.get(optId) as ModifierOptionRow | undefined
      if (!opt) throw new AppError(ErrorCode.NotFound, `Modifier option not found: ${optId}`)
      if (opt.is_active !== 1) {
        throw new AppError(ErrorCode.Validation, `Modifier "${opt.name}" is no longer available.`)
      }
      if (!linkStmt.get(product.id, opt.group_id)) {
        throw new AppError(
          ErrorCode.Validation,
          `Modifier "${opt.name}" is not valid for "${product.name}".`
        )
      }
      chosen.push(opt)
      chosenGroups.set(opt.group_id, (chosenGroups.get(opt.group_id) ?? 0) + 1)
    }
    // Enforce per-group cardinality ceiling. (Minimum/required enforcement is
    // a documented UI gap: the POS has no modifier picker yet, so orders may
    // skip required groups — blocking them here would halt sales.)
    const groups = this.db
      .prepare(
        `SELECT g.id, g.name, g.max_select
         FROM modifier_groups g JOIN product_modifier_groups p ON p.group_id = g.id
         WHERE p.product_id = ?`
      )
      .all(product.id) as { id: string; name: string; max_select: number }[]
    for (const g of groups) {
      const count = chosenGroups.get(g.id) ?? 0
      if (count > g.max_select) {
        throw new AppError(
          ErrorCode.Validation,
          `Too many selections in "${g.name}" (max ${g.max_select}).`
        )
      }
    }
    return chosen
  }

  private insertLines(orderId: string, lines: LineResult[]): void {
    const insLine = this.db.prepare(
      `INSERT INTO order_lines (
        id, order_id, product_id, variant_id, sku, name, quantity, unit_price,
        line_discount, tax_bps, tax_amount, line_total, course, seat, notes,
        allergy_flag, status, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
    )
    const insMod = this.db.prepare(
      'INSERT INTO order_line_modifiers (id, order_line_id, modifier_option_id, name, price_delta) VALUES (?, ?, ?, ?, ?)'
    )
    const taxBpsByProduct = (product: ProductRow): number => {
      if (!product.tax_id) return 0
      const t = this.db.prepare('SELECT rate_bps FROM taxes WHERE id = ?').get(product.tax_id) as
        { rate_bps: number } | undefined
      return t?.rate_bps ?? 0
    }

    lines.forEach((line, idx) => {
      const { input, product } = line
      const lineId = id()
      insLine.run(
        lineId,
        orderId,
        input.productId,
        input.variantId ?? null,
        product.sku,
        product.name,
        input.quantityMilli,
        input.unitPriceOverride ?? product.price,
        line.discount,
        taxBpsByProduct(product),
        line.tax,
        line.lineTotal,
        input.course ?? null,
        input.seat ?? null,
        input.notes ?? null,
        input.notes?.toLowerCase().includes('allerg') ? 1 : 0,
        idx
      )
      // Only validated modifiers (already checked active + linked to the product)
      for (const opt of line.modifierOptions) {
        insMod.run(id(), lineId, opt.id, opt.name, opt.price_delta)
      }
    })
  }

  private deductStock(orderId: string, userId: string): void {
    const lines = this.db
      .prepare(
        `SELECT ol.*, p.track_stock, p.is_weighted
         FROM order_lines ol JOIN products p ON p.id = ol.product_id
         WHERE ol.order_id = ?`
      )
      .all(orderId) as (LineRow & { track_stock: number; is_weighted: number })[]
    const ins = this.db.prepare(
      `INSERT INTO stock_movements (id, product_id, variant_id, branch_id, qty_delta, reason, ref_type, ref_id, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'sale', 'order', ?, ?, ?)`
    )
    const t = now()
    for (const l of lines) {
      if (l.track_stock !== 1) continue
      ins.run(
        id(),
        l.product_id,
        l.variant_id ?? null,
        this.branchId,
        -l.quantity,
        orderId,
        userId,
        t
      )
    }
  }

  private nextOrderNumber(): { number: number; label: string } {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const row = this.db
      .prepare(
        `INSERT INTO order_counters (branch_id, date_key, last_no) VALUES (?, ?, 1)
         ON CONFLICT(branch_id, date_key) DO UPDATE SET last_no = last_no + 1
         RETURNING last_no`
      )
      .get(this.branchId, d) as { last_no: number }
    return { number: row.last_no, label: `ORD-${d}-${String(row.last_no).padStart(4, '0')}` }
  }

  private currentShiftId(): string | null {
    const s = this.db
      .prepare(
        `SELECT id FROM shifts WHERE branch_id = ? AND register_id IS NOT NULL AND status = 'open' LIMIT 1`
      )
      .get(this.branchId) as { id: string } | undefined
    return s?.id ?? null
  }

  private markTable(tableId: string, status: string): void {
    void status
    // Floor-plan state is derived from orders; nothing to persist here in v1.
    void tableId
  }

  private row(id: string): OrderRow {
    const row = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Order not found: ${id}`)
    if (row.branch_id !== this.branchId) {
      // Scope violation: the order exists but belongs to another branch.
      throw new AppError(ErrorCode.Forbidden, 'Order belongs to a different branch.')
    }
    return row
  }

  private toOrder(
    o: OrderRow,
    lines: LineRow[],
    modifiers: {
      order_line_id: string
      modifier_option_id: string
      name: string
      price_delta: number
      id: string
    }[]
  ): Order {
    const byLine = new Map<string, OrderLineModifier[]>()
    for (const m of modifiers) {
      const list = byLine.get(m.order_line_id) ?? []
      list.push({
        id: m.id,
        modifierOptionId: m.modifier_option_id,
        name: m.name,
        priceDelta: m.price_delta
      })
      byLine.set(m.order_line_id, list)
    }
    return {
      id: o.id,
      number: o.number,
      numberLabel: o.number_label,
      type: o.type as OrderType,
      status: o.status as Order['status'],
      branchId: o.branch_id,
      registerId: o.register_id ?? undefined,
      terminalId: o.terminal_id,
      shiftId: o.shift_id ?? undefined,
      userId: o.user_id,
      userName:
        (
          this.db.prepare('SELECT display_name FROM users WHERE id = ?').get(o.user_id) as
            { display_name: string } | undefined
        )?.display_name ?? 'Unknown',
      customerId: o.customer_id ?? undefined,
      tableId: o.table_id ?? undefined,
      lines: lines.map((l): OrderLine => ({
        id: l.id,
        orderId: l.order_id,
        productId: l.product_id,
        variantId: l.variant_id ?? undefined,
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        lineDiscount: l.line_discount,
        taxBps: l.tax_bps,
        taxAmount: l.tax_amount,
        lineTotal: l.line_total,
        kitchenStation: l.kitchen_station ?? undefined,
        course: l.course ?? undefined,
        seat: l.seat ?? undefined,
        notes: l.notes ?? undefined,
        allergyFlag: l.allergy_flag === 1,
        status: l.status as OrderLine['status'],
        modifiers: byLine.get(l.id) ?? []
      })),
      subtotal: o.subtotal,
      discountTotal: o.discount_total,
      taxTotal: o.tax_total,
      serviceCharge: o.service_charge,
      tip: o.tip,
      roundingAdjustment: o.rounding_adjustment,
      total: o.total,
      amountPaid: this.paidAmount(o.id),
      changeGiven: this.changeGiven(o.id),
      holdName: o.hold_name ?? undefined,
      createdAt: o.created_at,
      completedAt: o.completed_at ?? undefined,
      voidedAt: o.voided_at ?? undefined,
      voidReason: o.void_reason ?? undefined
    }
  }

  private paidAmount(orderId: string): number {
    return (
      this.db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE order_id = ? AND status = 'approved'`
        )
        .get(orderId) as { s: number }
    ).s
  }

  private changeGiven(orderId: string): number {
    return (
      this.db
        .prepare(
          `SELECT COALESCE(SUM(change_amount), 0) AS s FROM payments WHERE order_id = ? AND status = 'approved'`
        )
        .get(orderId) as { s: number }
    ).s
  }
}

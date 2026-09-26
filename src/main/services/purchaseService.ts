import type { DB } from '../db/database'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { PurchaseOrder, PurchaseOrderItem, Supplier } from '@shared/types/models'
import type { PurchaseOrderInput, SupplierInput } from '@shared/ipc/api'
import type { AuthService } from './authService'
import type { SyncService } from './syncService'

const now = (): string => new Date().toISOString()
const newId = (): string => crypto.randomUUID()

interface SupplierRow {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: number
}

interface PoRow {
  id: string
  number: number
  supplier_id: string
  supplier_name: string
  branch_id: string
  status: string
  expected_at: string | null
  notes: string | null
  created_by: string
  created_at: string
  sent_at: string | null
  received_at: string | null
}

interface PoItemRow {
  id: string
  po_id: string
  product_id: string
  variant_id: string | null
  qty_ordered: number
  qty_received: number
  unit_cost: number
  sku: string
  name: string
}

export interface TestHooks {
  /** Called inside the receiving transaction just before commit (test-only). */
  beforeCommit?: (label: string) => void
}

const toSupplier = (r: SupplierRow): Supplier => ({
  id: r.id,
  name: r.name,
  contactName: r.contact_name ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  address: r.address ?? undefined,
  isActive: r.is_active === 1
})

/**
 * Purchasing: suppliers + purchase orders with a strict state machine
 *   draft → sent → partial → received   (cancel allowed from draft/sent)
 *
 * Receiving happens in a single IMMEDIATE transaction: PO item counters,
 * stock movements, weighted-average cost update and audit are all-or-nothing.
 */
export class PurchaseService {
  constructor(
    private db: DB,
    private auth: AuthService,
    private branchId: string,
    private hooks?: TestHooks,
    private sync?: SyncService
  ) {}

  // -------------------------------------------------------------------------
  // Suppliers
  // -------------------------------------------------------------------------

  listSuppliers(search?: string): Supplier[] {
    const rows = (
      search
        ? this.db
            .prepare(
              `SELECT * FROM suppliers WHERE is_active = 1 AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 200`
            )
            .all(`%${search.replace(/([%_\\])/g, '\\$1')}%`)
        : this.db
            .prepare('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name LIMIT 500')
            .all()
    ) as SupplierRow[]
    return rows.map(toSupplier)
  }

  saveSupplier(input: SupplierInput, actorId: string): Supplier {
    if (!input.name.trim()) throw new AppError(ErrorCode.Validation, 'Supplier name is required.')
    if (input.id) {
      const existing = this.db.prepare('SELECT id FROM suppliers WHERE id = ?').get(input.id) as
        { id: string } | undefined
      if (!existing) throw new AppError(ErrorCode.NotFound, `Supplier not found: ${input.id}`)
      this.db
        .prepare(
          `UPDATE suppliers SET name=?, contact_name=?, phone=?, email=?, address=? WHERE id=?`
        )
        .run(
          input.name.trim(),
          input.contactName?.trim() || null,
          input.phone?.trim() || null,
          input.email?.trim() || null,
          input.address?.trim() || null,
          input.id
        )
      this.auth.audit(actorId, undefined, 'suppliers.update', 'supplier', input.id, undefined, {
        name: input.name
      })
      return this.getSupplier(input.id)
    }
    const supplierId = newId()
    this.db
      .prepare(
        `INSERT INTO suppliers (id, name, contact_name, phone, email, address)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        supplierId,
        input.name.trim(),
        input.contactName?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.address?.trim() || null
      )
    this.auth.audit(actorId, undefined, 'suppliers.create', 'supplier', supplierId, undefined, {
      name: input.name
    })
    return this.getSupplier(supplierId)
  }

  getSupplier(supplierId: string): Supplier {
    const row = this.db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as
      SupplierRow | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Supplier not found: ${supplierId}`)
    return toSupplier(row)
  }

  // -------------------------------------------------------------------------
  // Purchase orders
  // -------------------------------------------------------------------------

  listPOs(status?: string): PurchaseOrder[] {
    const rows = (
      status
        ? this.db
            .prepare(
              `SELECT p.*, s.name AS supplier_name FROM purchase_orders p
               JOIN suppliers s ON s.id = p.supplier_id
               WHERE p.branch_id = ? AND p.status = ?
               ORDER BY p.number DESC LIMIT 500`
            )
            .all(this.branchId, status)
        : this.db
            .prepare(
              `SELECT p.*, s.name AS supplier_name FROM purchase_orders p
               JOIN suppliers s ON s.id = p.supplier_id
               WHERE p.branch_id = ?
               ORDER BY p.number DESC LIMIT 500`
            )
            .all(this.branchId)
    ) as PoRow[]
    return rows.map((r) => this.toPo(r, this.itemsOf(r.id)))
  }

  getPO(poId: string): PurchaseOrder {
    const row = this.poRow(poId)
    return this.toPo(row, this.itemsOf(row.id))
  }

  createPO(input: PurchaseOrderInput, userId: string): PurchaseOrder {
    if (input.items.length === 0) {
      throw new AppError(ErrorCode.Validation, 'A purchase order needs at least one line.')
    }
    this.getSupplier(input.supplierId) // exists
    for (const item of input.items) {
      if (item.qtyMilli <= 0 || !Number.isInteger(item.qtyMilli)) {
        throw new AppError(ErrorCode.Validation, 'Ordered quantity must be a positive integer.')
      }
      if (item.unitCost < 0 || !Number.isInteger(item.unitCost)) {
        throw new AppError(ErrorCode.Validation, 'Unit cost must be a non-negative integer.')
      }
      const product = this.db
        .prepare('SELECT id FROM products WHERE id = ?')
        .get(item.productId) as { id: string } | undefined
      if (!product) throw new AppError(ErrorCode.NotFound, `Product not found: ${item.productId}`)
      if (item.variantId) {
        const variant = this.db
          .prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ?')
          .get(item.variantId, item.productId) as { id: string } | undefined
        if (!variant) throw new AppError(ErrorCode.NotFound, `Variant not found: ${item.variantId}`)
      }
    }

    const poId = newId()
    const t = now()
    const tx = this.db.transaction(() => {
      const number = (
        this.db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM purchase_orders').get() as {
          n: number
        }
      ).n
      this.db
        .prepare(
          `INSERT INTO purchase_orders (id, number, supplier_id, branch_id, status, expected_at, notes, created_by, created_at)
           VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
        )
        .run(
          poId,
          number,
          input.supplierId,
          this.branchId,
          input.expectedAt ?? null,
          input.notes ?? null,
          userId,
          t
        )
      const ins = this.db.prepare(
        `INSERT INTO purchase_order_items (id, po_id, product_id, variant_id, qty_ordered, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const item of input.items) {
        ins.run(newId(), poId, item.productId, item.variantId ?? null, item.qtyMilli, item.unitCost)
      }
      this.auth.audit(userId, undefined, 'po.create', 'purchase_order', poId, this.branchId, {
        number,
        supplierId: input.supplierId,
        lines: input.items.length
      })
    })
    tx.immediate()
    return this.getPO(poId)
  }

  sendPO(poId: string, userId: string): PurchaseOrder {
    const po = this.poRow(poId)
    if (po.status !== 'draft') {
      throw new AppError(ErrorCode.InvalidState, `PO #${po.number} is ${po.status}, not draft.`)
    }
    this.db
      .prepare(`UPDATE purchase_orders SET status = 'sent', sent_at = ? WHERE id = ?`)
      .run(now(), poId)
    this.auth.audit(userId, undefined, 'po.send', 'purchase_order', poId, this.branchId, {
      number: po.number
    })
    return this.getPO(poId)
  }

  /**
   * Receive stock against a PO. May be called multiple times until complete.
   * Over-receiving is rejected; every received unit creates a stock movement
   * and updates the product's weighted-average cost.
   */
  receivePO(
    poId: string,
    received: { itemId: string; qtyMilli: number }[],
    userId: string,
    clientOpId?: string
  ): PurchaseOrder {
    const po = this.poRow(poId)
    if (!['sent', 'partial'].includes(po.status)) {
      throw new AppError(
        ErrorCode.InvalidState,
        `PO #${po.number} is ${po.status}; cannot receive against it.`
      )
    }
    if (received.length === 0) {
      throw new AppError(ErrorCode.Validation, 'Nothing to receive.')
    }
    // Idempotency: a client retry with the same op id returns the current
    // state instead of double-receiving stock.
    if (clientOpId && this.sync) {
      const seen = this.db
        .prepare('SELECT 1 FROM sync_outbox WHERE op_id = ?')
        .get(`po-receive:${clientOpId}`)
      if (seen) return this.getPO(poId)
    }
    const t = now()
    const tx = this.db.transaction(() => {
      const movement = this.db.prepare(
        `INSERT INTO stock_movements (id, product_id, variant_id, branch_id, qty_delta, reason, ref_type, ref_id, unit_cost, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'receive', 'purchase_order', ?, ?, ?, ?)`
      )
      for (const r of received) {
        if (!Number.isInteger(r.qtyMilli) || r.qtyMilli <= 0) {
          throw new AppError(ErrorCode.Validation, 'Received quantity must be a positive integer.')
        }
        const item = this.db
          .prepare('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?')
          .get(r.itemId, poId) as
          | {
              id: string
              product_id: string
              variant_id: string | null
              qty_ordered: number
              qty_received: number
              unit_cost: number
            }
          | undefined
        if (!item) throw new AppError(ErrorCode.NotFound, `PO line not found: ${r.itemId}`)
        const remaining = item.qty_ordered - item.qty_received
        if (r.qtyMilli > remaining) {
          throw new AppError(
            ErrorCode.Validation,
            `Over-receiving: ${r.qtyMilli} exceeds remaining ${remaining} on this line.`
          )
        }

        this.db
          .prepare('UPDATE purchase_order_items SET qty_received = qty_received + ? WHERE id = ?')
          .run(r.qtyMilli, item.id)
        movement.run(
          newId(),
          item.product_id,
          item.variant_id ?? null,
          this.branchId,
          r.qtyMilli,
          poId,
          item.unit_cost,
          userId,
          t
        )
        this.applyWeightedAverageCost(item.product_id, item.variant_id, r.qtyMilli, item.unit_cost)
      }

      const complete =
        (
          this.db
            .prepare(
              'SELECT COUNT(*) AS c FROM purchase_order_items WHERE po_id = ? AND qty_received < qty_ordered'
            )
            .get(poId) as { c: number }
        ).c === 0
      this.db
        .prepare(
          `UPDATE purchase_orders SET status = ?, received_at = COALESCE(?, received_at) WHERE id = ?`
        )
        .run(complete ? 'received' : 'partial', complete ? t : null, poId)

      if (clientOpId) {
        this.sync?.enqueue(`po-receive:${clientOpId}`, 'purchase_order', poId, 'receive', {
          number: po.number,
          lines: received,
          status: complete ? 'received' : 'partial'
        })
      }
      this.hooks?.beforeCommit?.('po.receive')
      this.auth.audit(userId, undefined, 'po.receive', 'purchase_order', poId, this.branchId, {
        number: po.number,
        lines: received.length,
        status: complete ? 'received' : 'partial'
      })
    })
    tx.immediate()
    return this.getPO(poId)
  }

  cancelPO(poId: string, userId: string): PurchaseOrder {
    const po = this.poRow(poId)
    if (po.status === 'partial' || po.status === 'received') {
      // Stock has already moved — cancelling would orphan received inventory.
      throw new AppError(
        ErrorCode.InvalidState,
        `PO #${po.number} has received stock and cannot be cancelled.`
      )
    }
    if (po.status === 'cancelled') return this.getPO(poId) // idempotent
    this.db.prepare(`UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?`).run(poId)
    this.auth.audit(userId, undefined, 'po.cancel', 'purchase_order', poId, this.branchId, {
      number: po.number
    })
    return this.getPO(poId)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Weighted-average costing: on receive, the product cost moves to
   *   cost' = (onHand × cost + qty × unitCost) / (onHand + qty)
   * Falling back to the receipt cost when on-hand is zero or negative.
   */
  private applyWeightedAverageCost(
    productId: string,
    variantId: string | null,
    qtyMilli: number,
    unitCost: number
  ): void {
    const onHand = (
      this.db
        .prepare(
          `SELECT COALESCE(SUM(qty_delta), 0) AS q FROM stock_movements
           WHERE product_id = ? AND branch_id = ?
             AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))`
        )
        .get(productId, this.branchId, variantId, variantId) as { q: number }
    ).q
    const table = variantId ? 'product_variants' : 'products'
    const row = this.db
      .prepare(`SELECT cost FROM ${table} WHERE id = ?`)
      .get(variantId ?? productId) as { cost: number } | undefined
    if (!row) return
    const beforeQty = onHand - qtyMilli // movements already include this receipt
    const nextCost =
      beforeQty > 0
        ? Math.round((beforeQty * row.cost + qtyMilli * unitCost) / (beforeQty + qtyMilli))
        : unitCost
    this.db
      .prepare(`UPDATE ${table} SET cost = ? WHERE id = ?`)
      .run(Math.max(0, nextCost), variantId ?? productId)
    if (!variantId) {
      this.db.prepare(`UPDATE products SET updated_at = ? WHERE id = ?`).run(now(), productId)
    }
  }

  private poRow(poId: string): PoRow {
    const row = this.db
      .prepare(
        `SELECT p.*, s.name AS supplier_name FROM purchase_orders p
         JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`
      )
      .get(poId) as PoRow | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Purchase order not found: ${poId}`)
    if (row.branch_id !== this.branchId) {
      throw new AppError(ErrorCode.Forbidden, 'Purchase order belongs to a different branch.')
    }
    return row
  }

  private itemsOf(poId: string): PurchaseOrderItem[] {
    const rows = this.db
      .prepare(
        `SELECT i.*, p.sku, p.name FROM purchase_order_items i
         JOIN products p ON p.id = i.product_id
         WHERE i.po_id = ? ORDER BY p.name`
      )
      .all(poId) as PoItemRow[]
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      variantId: r.variant_id ?? undefined,
      sku: r.sku,
      name: r.name,
      qtyOrdered: r.qty_ordered,
      qtyReceived: r.qty_received,
      unitCost: r.unit_cost
    }))
  }

  private toPo(r: PoRow, items: PurchaseOrderItem[]): PurchaseOrder {
    return {
      id: r.id,
      number: r.number,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      branchId: r.branch_id,
      status: r.status as PurchaseOrder['status'],
      items,
      expectedAt: r.expected_at ?? undefined,
      notes: r.notes ?? undefined,
      createdById: r.created_by,
      createdAt: r.created_at,
      sentAt: r.sent_at ?? undefined,
      receivedAt: r.received_at ?? undefined
    }
  }
}

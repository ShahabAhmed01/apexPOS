import type { DB } from '../db/database'
import type { RestaurantTable, Zone, TableStatus } from '@shared/types/models'
import { AppError, ErrorCode } from '@shared/lib/errors'

const id = () => crypto.randomUUID()

export class RestaurantService {
  constructor(
    private db: DB,
    private branchId: string
  ) {}

  zones(): Zone[] {
    return (
      this.db
        .prepare('SELECT * FROM zones WHERE branch_id = ? ORDER BY sort_order, name')
        .all(this.branchId) as ZoneRow[]
    ).map((z) => ({ id: z.id, branchId: z.branch_id, name: z.name, sortOrder: z.sort_order }))
  }

  /** Throw unless the table belongs to this branch (via its zone). */
  private assertTableScope(tableId: string): void {
    const row = this.db
      .prepare(
        `SELECT z.branch_id FROM restaurant_tables t JOIN zones z ON z.id = t.zone_id WHERE t.id = ?`
      )
      .get(tableId) as { branch_id: string } | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Table not found: ${tableId}`)
    if (row.branch_id !== this.branchId) {
      throw new AppError(ErrorCode.Forbidden, 'Table belongs to a different branch.')
    }
  }

  /** Throw unless the order belongs to this branch. */
  private assertOrderScope(orderId: string): void {
    const row = this.db.prepare(`SELECT branch_id FROM orders WHERE id = ?`).get(orderId) as
      { branch_id: string } | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Order not found: ${orderId}`)
    if (row.branch_id !== this.branchId) {
      throw new AppError(ErrorCode.Forbidden, 'Order belongs to a different branch.')
    }
  }

  saveZone(input: { id?: string; name: string; sortOrder: number }): Zone {
    if (input.id) {
      const zone = this.db.prepare('SELECT branch_id FROM zones WHERE id = ?').get(input.id) as
        { branch_id: string } | undefined
      if (zone && zone.branch_id !== this.branchId) {
        throw new AppError(ErrorCode.Forbidden, 'Zone belongs to a different branch.')
      }
    }
    const zid = input.id ?? id()
    this.db
      .prepare(
        `INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`
      )
      .run(zid, this.branchId, input.name, input.sortOrder)
    return this.zones().find((z) => z.id === zid)!
  }

  tables(zoneId?: string): (RestaurantTable & { status: TableStatus; active_order?: string })[] {
    const rows = (
      zoneId
        ? this.db
            .prepare(
              `SELECT t.* FROM restaurant_tables t
               JOIN zones z ON z.id = t.zone_id
               WHERE t.zone_id = ? AND z.branch_id = ? ORDER BY t.name`
            )
            .all(zoneId, this.branchId)
        : this.db
            .prepare(
              `SELECT t.* FROM restaurant_tables t
               JOIN zones z ON z.id = t.zone_id WHERE z.branch_id = ? ORDER BY t.name`
            )
            .all(this.branchId)
    ) as TableRow[]

    return rows.map((t) => {
      // A table is occupied when it has a non-completed, non-void dine_in order
      const open = this.db
        .prepare(
          `SELECT id, table_id FROM orders
           WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void')
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(t.id) as { id: string } | undefined
      return {
        id: t.id,
        zoneId: t.zone_id,
        name: t.name,
        capacity: t.capacity,
        shape: t.shape as RestaurantTable['shape'],
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        rotation: t.rotation,
        status: this.tableStatus(open?.id),
        activeOrderId: open?.id
      }
    })
  }

  private tableStatus(activeOrderId?: string): TableStatus {
    if (!activeOrderId) return 'free'
    const order = this.db.prepare(`SELECT status FROM orders WHERE id = ?`).get(activeOrderId) as
      { status: string } | undefined
    if (!order) return 'free'
    if (order.status === 'billed') return 'bill'
    if (order.status === 'served') return 'served'
    if (order.status === 'sent_to_kitchen') return 'ordered'
    return 'seated'
  }

  saveTable(input: {
    id?: string
    zoneId: string
    name: string
    capacity: number
    shape: 'square' | 'round' | 'rect'
    x: number
    y: number
    w: number
    h: number
    rotation: number
  }): RestaurantTable {
    // The target zone must belong to this branch — no cross-branch tables.
    const zone = this.db.prepare('SELECT branch_id FROM zones WHERE id = ?').get(input.zoneId) as
      { branch_id: string } | undefined
    if (!zone) throw new AppError(ErrorCode.NotFound, `Zone not found: ${input.zoneId}`)
    if (zone.branch_id !== this.branchId) {
      throw new AppError(ErrorCode.Forbidden, 'Zone belongs to a different branch.')
    }
    if (input.id) {
      this.assertTableScope(input.id)
      this.db
        .prepare(
          `UPDATE restaurant_tables SET zone_id=?, name=?, capacity=?, shape=?, x=?, y=?, w=?, h=?, rotation=? WHERE id=?`
        )
        .run(
          input.zoneId,
          input.name,
          input.capacity,
          input.shape,
          input.x,
          input.y,
          input.w,
          input.h,
          input.rotation,
          input.id
        )
      return this.tables().find((t) => t.id === input.id)!
    }
    const tid = id()
    this.db
      .prepare(
        `INSERT INTO restaurant_tables (id, zone_id, name, capacity, shape, x, y, w, h, rotation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tid,
        input.zoneId,
        input.name,
        input.capacity,
        input.shape,
        input.x,
        input.y,
        input.w,
        input.h,
        input.rotation
      )
    return this.tables().find((t) => t.id === tid)!
  }

  /** Kitchen Display: all dine-in items in active statuses. */
  kitchenBoard(): KitchenTicket[] {
    const lines = this.db
      .prepare(
        `SELECT ol.id, ol.order_id, ol.name, ol.quantity, ol.notes, ol.course, ol.seat,
                ol.status, ol.sort_order, o.number_label, o.table_id, o.created_at
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id
         WHERE o.type = 'dine_in'
           AND o.status IN ('sent_to_kitchen', 'partially_served')
           AND ol.status IN ('queued', 'fired', 'preparing', 'ready')
         ORDER BY o.created_at, ol.sort_order`
      )
      .all() as KitchenLineRow[]

    const grouped = new Map<string, KitchenTicket>()
    for (const r of lines) {
      const t = grouped.get(r.order_id) ?? {
        orderId: r.order_id,
        orderNumber: r.number_label,
        tableId: r.table_id,
        createdAt: r.created_at,
        elapsedMinutes: 0,
        items: []
      }
      t.elapsedMinutes = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60000)
      t.items.push({
        id: r.id,
        name: r.name,
        quantity: r.quantity,
        notes: r.notes ?? undefined,
        course: r.course ?? undefined,
        seat: r.seat ?? undefined,
        status: r.status
      })
      grouped.set(r.order_id, t)
    }
    return [...grouped.values()]
  }

  setOrderStatus(
    orderId: string,
    status: 'sent_to_kitchen' | 'billed' | 'served' | 'partially_served'
  ): void {
    this.assertOrderScope(orderId)
    this.db
      .prepare('UPDATE orders SET status = ?, version = version + 1 WHERE id = ?')
      .run(status, orderId)
  }

  bumpLine(lineId: string): void {
    const line = this.db.prepare('SELECT order_id FROM order_lines WHERE id = ?').get(lineId) as
      { order_id: string } | undefined
    if (!line) throw new AppError(ErrorCode.NotFound, `Order line not found: ${lineId}`)
    this.assertOrderScope(line.order_id)
    this.db.prepare(`UPDATE order_lines SET status = 'served' WHERE id = ?`).run(lineId)
  }

  bumpTicket(orderId: string): void {
    this.assertOrderScope(orderId)
    this.db.prepare(`UPDATE order_lines SET status = 'served' WHERE order_id = ?`).run(orderId)
    this.setOrderStatus(orderId, 'served')
  }

  /** Move a table's active dine-in order to another (free) table. */
  transferOrderToTable(orderId: string, tableId: string): void {
    this.assertOrderScope(orderId)
    this.assertTableScope(tableId)
    const tx = this.db.transaction(() => {
      this.assertNoActiveOrderAt(tableId)
      this.db
        .prepare('UPDATE orders SET table_id = ?, version = version + 1 WHERE id = ?')
        .run(tableId, orderId)
      this.db
        .prepare(
          `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, branch_id, created_at)
           VALUES (?, NULL, 'system', 'tables.transfer', 'order', ?, ?, ?)`
        )
        .run(id(), orderId, this.branchId, new Date().toISOString())
    })
    tx.immediate()
  }

  fireCourse(orderId: string, course: string): void {
    this.assertOrderScope(orderId)
    this.db
      .prepare(`UPDATE order_lines SET status = 'fired' WHERE order_id = ? AND course = ?`)
      .run(orderId, course)
  }

  /**
   * Move order lines onto another table's order (creating it if the target
   * table is free). Source and target totals are reconciled from their lines.
   * Split bill = move a subset; merge tables = move all.
   */
  moveLines(sourceOrderId: string, lineIds: string[], targetTableId: string): string {
    this.assertOrderScope(sourceOrderId)
    this.assertTableScope(targetTableId)
    if (lineIds.length === 0) throw new AppError(ErrorCode.Validation, 'No lines selected.')
    const source = this.db
      .prepare(`SELECT id, table_id, status, type FROM orders WHERE id = ? AND type = 'dine_in'`)
      .get(sourceOrderId) as
      { id: string; table_id: string | null; status: string; type: string } | undefined
    if (!source) throw new AppError(ErrorCode.NotFound, `Order not found: ${sourceOrderId}`)
    if (['completed', 'void'].includes(source.status)) {
      throw new AppError(ErrorCode.InvalidState, `Cannot move lines from a ${source.status} order.`)
    }
    if (source.table_id === targetTableId) {
      throw new AppError(ErrorCode.Validation, 'Lines are already on that table.')
    }

    const tx = this.db.transaction(() => {
      const targetId =
        (
          this.db
            .prepare(
              `SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1`
            )
            .get(targetTableId) as { id: string } | undefined
        )?.id ?? this.openTable(targetTableId, 1, 'system')

      const linesToMove = this.db
        .prepare(
          `SELECT id FROM order_lines WHERE order_id = ? AND id IN (${lineIds.map(() => '?').join(',')})`
        )
        .all(sourceOrderId, ...lineIds) as { id: string }[]
      if (linesToMove.length !== lineIds.length) {
        throw new AppError(
          ErrorCode.NotFound,
          'One or more lines do not belong to the source order.'
        )
      }
      const move = this.db.prepare('UPDATE order_lines SET order_id = ? WHERE id = ?')
      for (const l of linesToMove) move.run(targetId, l.id)

      this.recomputeTotals(sourceOrderId)
      this.recomputeTotals(targetId)

      // Split leaves the source alive; moving all lines voids the empty shell
      // and frees its table.
      const remaining = (
        this.db
          .prepare('SELECT COUNT(*) c FROM order_lines WHERE order_id = ?')
          .get(sourceOrderId) as { c: number }
      ).c
      if (remaining === 0) {
        this.db
          .prepare(
            `UPDATE orders SET status = 'void', voided_at = ?, void_reason = 'merged/split away', version = version + 1
             WHERE id = ?`
          )
          .run(new Date().toISOString(), sourceOrderId)
      }
      this.db
        .prepare(
          `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, branch_id, context, created_at)
           VALUES (?, NULL, 'system', 'orders.moveLines', 'order', ?, ?, ?, ?)`
        )
        .run(
          id(),
          sourceOrderId,
          this.branchId,
          JSON.stringify({ targetId, lines: lineIds.length, sourceVoided: remaining === 0 }),
          new Date().toISOString()
        )
      return targetId
    })
    return tx.immediate() as string
  }

  /** Merge table B's whole order into the order on the target table. */
  mergeTables(sourceOrderId: string, targetTableId: string): string {
    const lineIds = (
      this.db.prepare('SELECT id FROM order_lines WHERE order_id = ?').all(sourceOrderId) as {
        id: string
      }[]
    ).map((l) => l.id)
    return this.moveLines(sourceOrderId, lineIds, targetTableId)
  }

  /** Recompute denormalized order totals from its lines (post split/merge). */
  private recomputeTotals(orderId: string): void {
    const sums = this.db
      .prepare(
        `SELECT COALESCE(SUM(line_total),0) total, COALESCE(SUM(tax_amount),0) tax,
                COALESCE(SUM(line_discount),0) discount,
                COALESCE(SUM(line_total - tax_amount),0) net
         FROM order_lines WHERE order_id = ?`
      )
      .get(orderId) as { total: number; tax: number; discount: number; net: number }
    this.db
      .prepare(
        `UPDATE orders SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?, version = version + 1
         WHERE id = ?`
      )
      .run(sums.net, sums.discount, sums.tax, sums.total, orderId)
  }

  private assertNoActiveOrderAt(tableId: string): void {
    const existing = this.db
      .prepare(
        `SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1`
      )
      .get(tableId)
    if (existing) {
      throw new AppError(ErrorCode.InvalidState, 'Target table already has an active order.')
    }
  }

  // Open a new dine-in order at a table (empty until lines are added)
  openTable(tableId: string, guests: number, serverId: string): string {
    this.assertTableScope(tableId)
    const existing = this.db
      .prepare(
        `SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1`
      )
      .get(tableId)
    if (existing) return (existing as { id: string }).id

    const orderId = id()
    // Compute the next branch-scoped number and embed it in the label in one
    // statement — otherwise every table order would share a bare "T-XXXX".
    this.db
      .prepare(
        `INSERT INTO orders (id, branch_id, number, number_label, type, status, terminal_id, user_id,
                             table_id, subtotal, discount_total, tax_total, service_charge, tip,
                             rounding_adjustment, total, created_at)
         SELECT ?, ?, n, 'T-' || ? || '-' || printf('%04d', n), 'dine_in', 'open', 'term-local-01', ?, ?, 0, 0, 0, 0, 0, 0, 0, ?
         FROM (SELECT COALESCE(MAX(number),0)+1 AS n FROM orders WHERE branch_id = ?)`
      )
      .run(
        orderId,
        this.branchId,
        this.branchId.slice(0, 4).toUpperCase(),
        serverId,
        tableId,
        new Date().toISOString(),
        this.branchId
      )
    void guests
    return orderId
  }

  /**
   * Close/clear a table. An order with items may NOT be "completed" here —
   * completing an order requires payment (POS checkout). An empty order is
   * voided instead. Tables with no active order are a no-op.
   */
  closeTable(tableId: string): void {
    this.assertTableScope(tableId)
    const active = this.db
      .prepare(
        `SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1`
      )
      .get(tableId) as { id: string } | undefined
    if (!active) return
    const lineCount = (
      this.db.prepare('SELECT COUNT(*) c FROM order_lines WHERE order_id = ?').get(active.id) as {
        c: number
      }
    ).c
    if (lineCount > 0) {
      throw new AppError(
        ErrorCode.InvalidState,
        'Table has an unpaid order. Complete payment or void the order first.'
      )
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE orders SET status = 'void', voided_at = ?, void_reason = 'closed empty', version = version + 1
           WHERE id = ?`
        )
        .run(new Date().toISOString(), active.id)
      this.db
        .prepare(
          `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, branch_id, created_at)
           VALUES (?, NULL, 'system', 'tables.close', 'order', ?, ?, ?)`
        )
        .run(id(), active.id, this.branchId, new Date().toISOString())
    })
    tx.immediate()
  }
}

export interface KitchenTicket {
  orderId: string
  orderNumber: string
  tableId: string | null
  createdAt: string
  elapsedMinutes: number
  items: {
    id: string
    name: string
    quantity: number
    notes?: string
    course?: string
    seat?: number
    status: string
  }[]
}

interface ZoneRow {
  id: string
  branch_id: string
  name: string
  sort_order: number
}

interface TableRow {
  id: string
  zone_id: string
  name: string
  capacity: number
  shape: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

interface KitchenLineRow {
  id: string
  order_id: string
  name: string
  quantity: number
  notes: string | null
  course: string | null
  seat: number | null
  status: string
  sort_order: number
  number_label: string
  table_id: string | null
  created_at: string
}

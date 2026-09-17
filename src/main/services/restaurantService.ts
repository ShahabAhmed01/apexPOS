import type { DB } from '../db/database'
import type { RestaurantTable, Zone, TableStatus } from '@shared/types/models'

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

  saveZone(input: { id?: string; name: string; sortOrder: number }): Zone {
    const zid = input.id ?? id()
    this.db
      .prepare(
        `INSERT INTO zones (id, branch_id, name, sort_order) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`
      )
      .run(zid, this.branchId, input.name, input.sortOrder)
    void input
    return this.zones().find((z) => z.id === zid)!
  }

  tables(zoneId?: string): (RestaurantTable & { status: TableStatus; active_order?: string })[] {
    const rows = (
      zoneId
        ? this.db.prepare('SELECT * FROM restaurant_tables WHERE zone_id = ? ORDER BY name').all(zoneId)
        : this.db.prepare('SELECT * FROM restaurant_tables ORDER BY name').all()
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
    const order = this.db
      .prepare(`SELECT status FROM orders WHERE id = ?`)
      .get(activeOrderId) as { status: string } | undefined
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
    if (input.id) {
      this.db
        .prepare(
          `UPDATE restaurant_tables SET zone_id=?, name=?, capacity=?, shape=?, x=?, y=?, w=?, h=?, rotation=? WHERE id=?`
        )
        .run(input.zoneId, input.name, input.capacity, input.shape, input.x, input.y, input.w, input.h, input.rotation, input.id)
      return this.tables().find((t) => t.id === input.id)!
    }
    const tid = id()
    this.db
      .prepare(
        `INSERT INTO restaurant_tables (id, zone_id, name, capacity, shape, x, y, w, h, rotation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(tid, input.zoneId, input.name, input.capacity, input.shape, input.x, input.y, input.w, input.h, input.rotation)
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
      t.elapsedMinutes = Math.floor(
        (Date.now() - new Date(r.created_at).getTime()) / 60000
      )
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

  setOrderStatus(orderId: string, status: 'sent_to_kitchen' | 'billed' | 'served' | 'partially_served'): void {
    this.db
      .prepare('UPDATE orders SET status = ?, version = version + 1 WHERE id = ?')
      .run(status, orderId)
  }

  bumpLine(lineId: string): void {
    this.db.prepare(`UPDATE order_lines SET status = 'served' WHERE id = ?`).run(lineId)
  }

  bumpTicket(orderId: string): void {
    this.db
      .prepare(`UPDATE order_lines SET status = 'served' WHERE order_id = ?`)
      .run(orderId)
    this.setOrderStatus(orderId, 'served')
  }

  transferOrderToTable(orderId: string, tableId: string): void {
    this.db.prepare('UPDATE orders SET table_id = ?, version = version + 1 WHERE id = ?').run(tableId, orderId)
  }

  fireCourse(orderId: string, course: string): void {
    this.db
      .prepare(`UPDATE order_lines SET status = 'fired' WHERE order_id = ? AND course = ?`)
      .run(orderId, course)
  }

  // Open a new dine-in order at a table (empty until lines are added)
  openTable(tableId: string, guests: number, serverId: string): string {
    const existing = this.db
      .prepare(
        `SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1`
      )
      .get(tableId)
    if (existing) return (existing as { id: string }).id

    const orderId = id()
    this.db
      .prepare(
        `INSERT INTO orders (id, branch_id, number, number_label, type, status, terminal_id, user_id,
                             table_id, subtotal, discount_total, tax_total, service_charge, tip,
                             rounding_adjustment, total, created_at)
         VALUES (?, ?, (SELECT COALESCE(MAX(number),0)+1 FROM orders WHERE branch_id = ?),
                 'T-' || ?, 'dine_in', 'open', 'term-local-01', ?, ?, 0, 0, 0, 0, 0, 0, 0, ?)`
      )
      .run(orderId, this.branchId, this.branchId.slice(0, 4).toUpperCase(), serverId, tableId, new Date().toISOString())
    void guests
    return orderId
  }

  closeTable(tableId: string): void {
    const active = this.db
      .prepare(
        `SELECT id FROM orders WHERE table_id = ? AND type = 'dine_in' AND status NOT IN ('completed','void') LIMIT 1`
      )
      .get(tableId) as { id: string } | undefined
    if (active) {
      this.db.prepare(`UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?`).run(new Date().toISOString(), active.id)
    }
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
  id: string; branch_id: string; name: string; sort_order: number
}

interface TableRow {
  id: string; zone_id: string; name: string; capacity: number; shape: string
  x: number; y: number; w: number; h: number; rotation: number
}

interface KitchenLineRow {
  id: string; order_id: string; name: string; quantity: number; notes: string | null
  course: string | null; seat: number | null; status: string; sort_order: number
  number_label: string; table_id: string | null; created_at: string
}

import type { DB } from '../db/database'

/**
 * Reporting service — all aggregates computed in SQL (no renderer-side rollups).
 */
export class ReportService {
  constructor(
    private db: DB,
    private branchId: string
  ) {}

  dashboard(): DashboardData {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const iso = todayStart.toISOString()

    const salesRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(total),0) AS sales, COUNT(*) AS orders
         FROM orders WHERE branch_id = ? AND created_at >= ? AND status = 'completed'`
      )
      .get(this.branchId, iso) as { sales: number; orders: number }

    const refundsRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(r.total),0) AS refunds FROM refunds r
         JOIN orders o ON o.id = r.order_id
         WHERE o.branch_id = ? AND r.created_at >= ?`
      )
      .get(this.branchId, iso) as { refunds: number }

    const payments = this.db
      .prepare(
        `SELECT p.method, COUNT(*) AS n, COALESCE(SUM(p.amount),0) AS amount
         FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE o.branch_id = ? AND p.created_at >= ? AND p.status = 'approved'
         GROUP BY p.method`
      )
      .all(this.branchId, iso) as { method: string; n: number; amount: number }[]

    const byHour = this.db
      .prepare(
        `SELECT strftime('%H', o.created_at) AS hour, COALESCE(SUM(o.total),0) AS sales, COUNT(*) AS orders
         FROM orders o
         WHERE o.branch_id = ? AND o.created_at >= ? AND o.status = 'completed'
         GROUP BY hour ORDER BY hour`
      )
      .all(this.branchId, iso) as { hour: string; sales: number; orders: number }[]

    const top = this.db
      .prepare(
        `SELECT ol.name, SUM(ol.quantity) AS qty, SUM(ol.line_total) AS revenue
         FROM order_lines ol JOIN orders o ON o.id = ol.order_id
         WHERE o.branch_id = ? AND o.created_at >= ? AND o.status = 'completed'
         GROUP BY ol.product_id ORDER BY revenue DESC LIMIT 8`
      )
      .all(this.branchId, iso) as { name: string; qty: number; revenue: number }[]

    return {
      salesToday: salesRow.sales,
      ordersToday: salesRow.orders,
      refundsToday: refundsRow.refunds,
      averageBasket: salesRow.orders > 0 ? Math.round(salesRow.sales / salesRow.orders) : 0,
      paymentsByMethod: payments.map((p) => ({ method: p.method, count: p.n, amount: p.amount })),
      salesByHour: byHour.map((h) => ({ hour: h.hour, sales: h.sales, orders: h.orders })),
      topProducts: top.map((t) => ({ name: t.name, quantity: t.qty, revenue: t.revenue }))
    }
  }

  salesSummary(from: string, to: string): SalesRow[] {
    const rows = this.db
      .prepare(
        `SELECT date(o.created_at) AS date,
                COUNT(*) AS orders,
                COALESCE(SUM(o.total),0) AS revenue,
                COALESCE(SUM(o.discount_total),0) AS discounts,
                COALESCE(SUM(o.tax_total),0) AS tax
         FROM orders o
         WHERE o.branch_id = ? AND o.created_at BETWEEN ? AND ? AND o.status = 'completed'
         GROUP BY date(o.created_at)
         ORDER BY date(o.created_at) DESC`
      )
      .all(this.branchId, from, to)
    return rows as SalesRow[]
  }

  topCategories(from: string, to: string): { name: string; revenue: number }[] {
    return this.db
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorized') AS name, COALESCE(SUM(ol.line_total),0) AS revenue
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id
         LEFT JOIN products p ON p.id = ol.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE o.branch_id = ? AND o.created_at BETWEEN ? AND ? AND o.status = 'completed'
         GROUP BY c.id ORDER BY revenue DESC`
      )
      .all(this.branchId, from, to) as { name: string; revenue: number }[]
  }

  shiftReport(shiftId: string): ShiftReport {
    const shift = this.db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as
      | {
          id: string
          user_id: string
          opening_float: number
          opened_at: string
          closed_at: string | null
          expected_cash: number | null
          counted_cash: number | null
          variance: number | null
        }
      | undefined
    if (!shift) throw new Error('Shift not found')

    const totals = this.db
      .prepare(
        `SELECT COALESCE(SUM(p.amount),0) AS amount, p.method
         FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE o.shift_id = ? AND p.status = 'approved'
         GROUP BY p.method`
      )
      .all(shiftId) as { method: string; amount: number }[]

    const orders = this.db
      .prepare(`SELECT COUNT(*) AS n FROM orders WHERE shift_id = ? AND status = 'completed'`)
      .get(shiftId) as { n: number }

    const refunds = this.db
      .prepare(
        `SELECT COALESCE(SUM(r.total),0) AS s FROM refunds r JOIN orders o ON o.id = r.order_id WHERE o.shift_id = ?`
      )
      .get(shiftId) as { s: number }

    return {
      shiftId,
      openedAt: shift.opened_at,
      closedAt: shift.closed_at ?? undefined,
      ordersCount: orders.n,
      paymentsByMethod: totals.map((t) => ({ method: t.method, amount: t.amount })),
      refunds: refunds.s,
      openingFloat: shift.opening_float,
      expectedCash: shift.expected_cash ?? undefined,
      countedCash: shift.counted_cash ?? undefined,
      variance: shift.variance ?? undefined
    }
  }

  hourlyHeatmap(from: string, to: string): { hour: number; sales: number }[] {
    const rows = this.db
      .prepare(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COALESCE(SUM(total),0) AS sales
         FROM orders WHERE branch_id = ? AND created_at BETWEEN ? AND ? AND status = 'completed'
         GROUP BY hour ORDER BY hour`
      )
      .all(this.branchId, from, to) as { hour: number; sales: number }[]
    return rows
  }
}

export interface DashboardData {
  salesToday: number
  ordersToday: number
  refundsToday: number
  averageBasket: number
  paymentsByMethod: { method: string; count: number; amount: number }[]
  salesByHour: { hour: string; sales: number; orders: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
}

interface SalesRow {
  date: string
  orders: number
  revenue: number
  discounts: number
  tax: number
}

interface ShiftReport {
  shiftId: string
  openedAt: string
  closedAt?: string
  ordersCount: number
  paymentsByMethod: { method: string; amount: number }[]
  refunds: number
  openingFloat: number
  expectedCash?: number
  countedCash?: number
  variance?: number
}

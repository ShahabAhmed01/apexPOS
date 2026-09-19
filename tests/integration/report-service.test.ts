import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { openDatabase, type DbContext } from '@main/db/database'
import { seedIfEmpty } from '@main/db/seed'
import { ReportService } from '@main/services/reportService'
import { execSync } from 'node:child_process'

let ctx: DbContext
let reports: ReportService
let branchId: string

beforeAll(() => {
  execSync('rm -f /tmp/apexfpos-reports.db*')
  ctx = openDatabase('/tmp/apexfpos-reports.db')
  seedIfEmpty(ctx.db)
  branchId = (ctx.db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: string }).id
  reports = new ReportService(ctx.db, branchId)
})

afterAll(() => ctx.close())

describe('ReportService (seeded 60-day history)', () => {
  it('dashboard aggregates today sales, orders, and payment mix', () => {
    const d = reports.dashboard()

    expect(d.ordersToday).toBeGreaterThan(0)
    expect(d.salesToday).toBeGreaterThan(0)
    expect(d.averageBasket).toBe(Math.round(d.salesToday / d.ordersToday))
    expect(d.paymentsByMethod.length).toBeGreaterThan(0)
    for (const p of d.paymentsByMethod) {
      expect(p.amount).toBeGreaterThan(0)
      expect(p.count).toBeGreaterThan(0)
    }
    // Seed generates local hours 8–21; ISO storage shifts by the local UTC offset
    const minUtcHour = (8 + new Date().getTimezoneOffset() / 60 + 24) % 24
    const maxUtcHour = (21 + new Date().getTimezoneOffset() / 60 + 24) % 24
    for (const h of d.salesByHour) {
      expect(Number(h.hour)).toBeGreaterThanOrEqual(minUtcHour)
      expect(Number(h.hour)).toBeLessThanOrEqual(maxUtcHour)
      expect(h.sales).toBeGreaterThan(0)
    }
  })

  it('dashboard top products match order line rollups', () => {
    const d = reports.dashboard()
    expect(d.topProducts.length).toBeGreaterThan(0)
    expect(d.topProducts.length).toBeLessThanOrEqual(8)

    const expected = ctx.db
      .prepare(
        `SELECT ol.name, SUM(ol.line_total) AS revenue
         FROM order_lines ol JOIN orders o ON o.id = ol.order_id
         WHERE o.branch_id = ? AND o.status = 'completed'
           AND date(o.created_at) = date('now','localtime')
         GROUP BY ol.name ORDER BY revenue DESC LIMIT 8`
      )
      .all(branchId) as { name: string; revenue: number }[]

    for (let i = 0; i < expected.length; i++) {
      expect(d.topProducts[i]!.name).toBe(expected[i]!.name)
      expect(d.topProducts[i]!.revenue).toBe(expected[i]!.revenue)
    }
  })

  it('sales summary rows sum to completed order revenue over the range', () => {
    const to = new Date().toISOString()
    const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
    const summary = reports.salesSummary(from, to)

    expect(summary.length).toBeGreaterThan(50) // 60 seeded days

    const summaryRevenue = summary.reduce((a, s) => a + s.revenue, 0)
    const dbRevenue = (
      ctx.db
        .prepare(
          `SELECT COALESCE(SUM(total),0) AS s FROM orders
           WHERE branch_id = ? AND created_at BETWEEN ? AND ? AND status = 'completed'`
        )
        .get(branchId, from, to) as { s: number }
    ).s
    expect(summaryRevenue).toBe(dbRevenue)

    for (const row of summary) {
      expect(row.orders).toBeGreaterThan(0)
      expect(row.tax).toBeGreaterThanOrEqual(0)
      expect(row.revenue).toBeGreaterThanOrEqual(row.tax)
    }
  })

  it('top categories roll up under known category names', () => {
    const to = new Date().toISOString()
    const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
    const cats = reports.topCategories(from, to)

    expect(cats.length).toBeGreaterThan(0)
    const known = new Set(
      (ctx.db.prepare('SELECT name FROM categories').all() as { name: string }[])
        .map((c) => c.name)
        .concat('Uncategorized')
    )
    for (const c of cats) {
      expect(known.has(c.name)).toBe(true)
      expect(c.revenue).toBeGreaterThan(0)
    }
  })

  it('hourly heatmap stays inside seeded hours', () => {
    const to = new Date().toISOString()
    const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
    const hours = reports.hourlyHeatmap(from, to)

    expect(hours.length).toBeGreaterThan(0)
    const minUtcHour = (8 + new Date().getTimezoneOffset() / 60 + 24) % 24
    const maxUtcHour = (21 + new Date().getTimezoneOffset() / 60 + 24) % 24
    for (const h of hours) {
      expect(h.hour).toBeGreaterThanOrEqual(minUtcHour)
      expect(h.hour).toBeLessThanOrEqual(maxUtcHour)
      expect(h.sales).toBeGreaterThan(0)
    }
  })
})

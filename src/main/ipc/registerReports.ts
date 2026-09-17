import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import type { ReportService } from '../services/reportService'

const rangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  branchId: z.string().optional()
})

const defaultRange = (r: { from?: string; to?: string }): { from: string; to: string } => {
  const to = r.to ?? new Date().toISOString()
  const from = r.from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  return { from, to }
}

export const registerReportsIpc = (services: Services, sessionStore: SessionStore): void => {
  const reports = services.reports as ReportService

  handle(IpcChannel.ReportsDashboard, {
    permission: 'reports.view',
    handler: () => reports.dashboard()
  }, services, () => sessionStore.get())

  handle(IpcChannel.ReportsSales, {
    permission: 'reports.view',
    schema: rangeSchema,
    handler: (_ctx, input: { from?: string; to?: string }) => {
      const r = defaultRange(input)
      return {
        summary: reports.salesSummary(r.from, r.to),
        categories: reports.topCategories(r.from, r.to),
        hours: reports.hourlyHeatmap(r.from, r.to)
      }
    }
  }, services, () => sessionStore.get())

  handle(IpcChannel.ReportsFinancial, {
    permission: 'reports.view',
    schema: rangeSchema,
    handler: (_ctx, input: { from?: string; to?: string }) => {
      const r = defaultRange(input)
      const summary = reports.salesSummary(r.from, r.to)
      const gross = summary.reduce((a, s) => a + s.revenue, 0)
      const discounts = summary.reduce((a, s) => a + s.discounts, 0)
      const tax = summary.reduce((a, s) => a + s.tax, 0)
      return { gross, discounts, tax, net: gross - discounts }
    }
  }, services, () => sessionStore.get())
}

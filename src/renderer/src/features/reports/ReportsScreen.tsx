import { useCallback, useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { SalesReport, FinancialReport } from '@shared/ipc/api'
import { toCsv, downloadCsv } from './csv'

const FMT = (m: number): string =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0
  }).format(m / 100)

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

export const ReportsScreen = (): React.ReactElement => {
  const [tab, setTab] = useState<'sales' | 'financial'>('sales')
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400_000)))
  const [to, setTo] = useState(isoDay(new Date()))
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [financial, setFinancial] = useState<FinancialReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    const range = { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` }
    const s = await window.api.reports.sales(range)
    const f = await window.api.reports.financial(range)
    if (!s.ok) setError(s.error.message)
    else setSales(s.data)
    if (!f.ok) setError(f.error.message)
    else setFinancial(f.data)
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const exportCsv = (): void => {
    if (!sales || !financial) return
    if (tab === 'sales') {
      const csv = toCsv(
        ['Date', 'Orders', 'Revenue (minor)', 'Discounts (minor)', 'Tax (minor)'],
        sales.summary.map((r) => [r.date, r.orders, r.revenue, r.discounts, r.tax])
      )
      downloadCsv(`apexpos-sales_${from}_${to}.csv`, csv)
    } else if (financial) {
      const csv = toCsv(
        ['Metric', 'Amount (minor)'],
        [
          ['Gross sales', financial.gross],
          ['Discounts', financial.discounts],
          ['Net sales', financial.net],
          ['Tax collected', financial.tax]
        ]
      )
      downloadCsv(`apexpos-financial_${from}_${to}.csv`, csv)
    }
  }

  const maxHour = sales ? Math.max(1, ...sales.hours.map((h) => h.sales)) : 1

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <FileText size={18} className="text-[var(--color-text-2)]" aria-hidden /> Reports
        </h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-2)]" htmlFor="rep-from">
            From
          </label>
          <input
            id="rep-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] px-2 text-sm text-[var(--color-text-0)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <label className="text-xs text-[var(--color-text-2)]" htmlFor="rep-to">
            To
          </label>
          <input
            id="rep-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] px-2 text-sm text-[var(--color-text-0)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <Button size="sm" onClick={() => void exportCsv()} disabled={!sales || !financial}>
            <Download size={14} aria-hidden /> Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      <div
        className="mt-4 flex gap-1 border-b border-[var(--color-border)]"
        role="tablist"
        aria-label="Report type"
      >
        {(['sales', 'financial'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize transition-colors duration-[var(--duration-fast)] ${tab === t ? 'border-[var(--color-accent)] font-medium text-[var(--color-accent)]' : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text-1)]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        className="mt-4 min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="region"
        aria-label="Report data"
      >
        {tab === 'sales' && sales && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-start">Date</th>
                  <th className="text-end">Orders</th>
                  <th className="text-end">Revenue</th>
                  <th className="text-end">Discounts</th>
                  <th className="text-end">Tax</th>
                </tr>
              </thead>
              <tbody>
                {sales.summary.map((r) => (
                  <tr key={r.date}>
                    <td className="px-4 py-1.5">{r.date}</td>
                    <td className="nums px-4 py-1.5 text-end">{r.orders}</td>
                    <td className="nums px-4 py-1.5 text-end">{FMT(r.revenue)}</td>
                    <td className="nums px-4 py-1.5 text-end">{FMT(r.discounts)}</td>
                    <td className="nums px-4 py-1.5 text-end">{FMT(r.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="mt-8 mb-3 text-sm font-semibold">Sales by hour of day (range)</h2>
            <div
              className="flex items-end gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-4"
              style={{ height: 160 }}
              aria-label="Hourly sales heatmap"
            >
              {sales.hours.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    className="w-full rounded-t-[4px] bg-[var(--color-accent)] transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
                    style={{
                      height: `${Math.max(h.sales > 0 ? 4 : 0, (h.sales / maxHour) * 104)}px`
                    }}
                    title={`${h.hour}:00 — ${FMT(h.sales)}`}
                  />
                  <span className="text-[10px] text-[var(--color-text-2)] nums">{h.hour}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'financial' && financial && (
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            {[
              ['Gross sales', financial.gross],
              ['Discounts', -financial.discounts],
              ['Net sales', financial.net],
              ['Tax collected', financial.tax]
            ].map(([label, value]) => (
              <div key={label as string} className="panel p-4">
                <p className="text-xs font-medium text-[var(--color-text-2)]">{label as string}</p>
                <p
                  className={`nums mt-2 text-xl font-bold tracking-tight ${(value as number) < 0 ? 'text-[var(--color-danger)]' : ''}`}
                >
                  {FMT(value as number)}
                </p>
              </div>
            ))}
          </div>
        )}

        {!sales && !error && <p className="text-sm text-[var(--color-text-2)]">Loading…</p>}
      </div>
    </div>
  )
}

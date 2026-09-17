import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts'
import { TrendingUp, Receipt, RotateCcw, ShoppingCart } from 'lucide-react'
import type { DashboardData } from '@shared/ipc/api'

const FMT = (m: number): string =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(m / 100)

const COLORS = ['#5b8cff', '#34c98e', '#f5a524', '#38bdf8', '#a78bfa', '#f5475c']

export const DashboardScreen = (): React.ReactElement => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await window.api.reports.dashboard()
      if (res.ok) setData(res.data)
      else setError(res.error.message)
    })()
  }, [])

  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      </div>
    )
  }

  if (!data) {
    return <div className="p-6 text-sm text-[var(--color-text-2)]">Loading dashboard…</div>
  }

  const stats = [
    { label: 'Sales today', value: FMT(data.salesToday), icon: TrendingUp, tone: 'text-[var(--color-accent)]' },
    { value: String(data.ordersToday), icon: Receipt, label: 'Orders today', tone: 'text-[var(--color-info)]' },
    { value: FMT(data.averageBasket), icon: ShoppingCart, label: 'Average basket', tone: 'text-[var(--color-success)]' },
    { value: FMT(data.refundsToday), icon: RotateCcw, label: 'Refunds today', tone: 'text-[var(--color-danger)]' }
  ]

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--color-text-2)]">{s.label}</p>
              <s.icon size={16} className={s.tone} aria-hidden />
            </div>
            <p className={`nums mt-2 text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-4" aria-label="Sales by hour">
          <h2 className="mb-4 text-sm font-semibold">Sales by hour (today)</h2>
          {data.salesByHour.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-text-2)]">No sales yet today.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.salesByHour}>
                <defs>
                  <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="hour" stroke="var(--color-text-2)" fontSize={11} tickFormatter={(h: string) => `${h}:00`} />
                <YAxis stroke="var(--color-text-2)" fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 100)}`} />
                <Tooltip
                  formatter={(v) => FMT(Number(v))}
                  contentStyle={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="sales" stroke="#5b8cff" fill="url(#hourGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-4" aria-label="Payment mix">
          <h2 className="mb-4 text-sm font-semibold">Payment mix (today)</h2>
          {data.paymentsByMethod.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-text-2)]">No payments yet today.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.paymentsByMethod} dataKey="amount" nameKey="method" innerRadius={60} outerRadius={90} paddingAngle={3}>
                  {data.paymentsByMethod.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(v: string) => <span style={{ color: 'var(--color-text-1)', fontSize: 12 }}>{v}</span>} />
                <Tooltip
                  formatter={(v) => FMT(Number(v))}
                  contentStyle={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-4" aria-label="Top products">
        <h2 className="mb-4 text-sm font-semibold">Top products (today)</h2>
        {data.topProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-2)]">No product sales yet today.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-text-2)" fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 100)}`} />
              <YAxis type="category" dataKey="name" stroke="var(--color-text-2)" fontSize={11} width={140} />
              <Tooltip
                formatter={(v) => FMT(Number(v))}
                contentStyle={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="revenue" fill="#5b8cff" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  )
}

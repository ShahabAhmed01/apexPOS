import { useEffect, useState, useCallback } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { Button } from '../../design-system/Button'

interface TicketItem {
  id: string
  name: string
  quantity: number
  notes?: string
  course?: string
  seat?: number
  status: string
}

interface KitchenTicket {
  orderId: string
  orderNumber: string
  tableId: string | null
  createdAt: string
  elapsedMinutes: number
  items: TicketItem[]
}

/** Kitchen Display System — live tickets, urgency by elapsed time, bump to serve. */
export const KitchenScreen = (): React.ReactElement => {
  const [tickets, setTickets] = useState<KitchenTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async (): Promise<void> => {
    const res = await window.api.kitchen.board()
    if (res.ok) setTickets(res.data as KitchenTicket[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => {
      setNow(Date.now())
      void load()
    }, 5000)
    return () => clearInterval(t)
  }, [load])

  const bump = async (orderId: string): Promise<void> => {
    await window.api.kitchen.bump(orderId)
    void load()
  }

  const urgency = (mins: number): string =>
    mins >= 20
      ? 'border-[var(--color-danger)]'
      : mins >= 10
        ? 'border-[var(--color-warning)]'
        : 'border-[var(--color-border)]'

  const urgencyLabel = (mins: number): string =>
    mins >= 20
      ? 'text-[var(--color-danger)]'
      : mins >= 10
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-text-2)]'

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="animate-spin text-[var(--color-text-2)]" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-0)] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold">Kitchen Display</h1>
        <p className="text-xs text-[var(--color-text-2)]">
          {tickets.length} active tickets · <span className="nums">{new Date(now).toLocaleTimeString()}</span>
        </p>
      </div>
      {tickets.length === 0 ? (
        <div className="flex h-96 flex-col items-center justify-center text-center text-[var(--color-text-2)]">
          <Clock size={40} className="mb-3 opacity-30" aria-hidden />
          <p className="text-sm">No orders in the kitchen right now</p>
          <p className="mt-1 text-xs">Fire a course from a dine-in order to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tickets.map((t) => (
            <article
              key={t.orderId}
              className={`overflow-hidden rounded-[var(--radius-md)] border-2 bg-[var(--color-bg-1)] ${urgency(t.elapsedMinutes)}`}
              aria-label={`Ticket ${t.orderNumber}`}
            >
              <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <div>
                  <span className="font-semibold">{t.orderNumber}</span>
                </div>
                <div className={`flex items-center gap-1 text-sm ${urgencyLabel(t.elapsedMinutes)}`}>
                  <Clock size={14} aria-hidden />
                  <span className="nums">{t.elapsedMinutes}m ago</span>
                </div>
              </header>
              <ul className="divide-y divide-[var(--color-border)]">
                {t.items.map((item) => (
                  <li key={item.id} className="px-4 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{item.name}</span>
                      <span className="nums text-[var(--color-text-2)]">×{(item.quantity / 1000).toString()}</span>
                    </div>
                    {item.notes && (
                      <p className="mt-0.5 rounded bg-[var(--color-warning-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                        ⚠ {item.notes}
                      </p>
                    )}
                    {item.course && (
                      <p className="mt-0.5 text-xs uppercase tracking-wider text-[var(--color-text-2)]">
                        {item.course}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <footer className="border-t border-[var(--color-border)] p-2">
                <Button variant="success" size="sm" className="w-full" onClick={() => void bump(t.orderId)}>
                  Bump — mark served
                </Button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

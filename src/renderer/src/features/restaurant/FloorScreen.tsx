import { useEffect, useState, useCallback } from 'react'
import { Users, UtensilsCrossed } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { RestaurantTable, Zone } from '@shared/types/models'
import { useSessionStore } from '../../stores/sessionStore'
import { useNavigate } from 'react-router-dom'

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-[var(--color-bg-2)] border-[var(--color-border)] text-[var(--color-text-1)]',
  seated: 'bg-[var(--color-info-subtle)] border-[var(--color-info)] text-[var(--color-info)]',
  ordered:
    'bg-[var(--color-warning-subtle)] border-[var(--color-warning)] text-[var(--color-warning)]',
  served:
    'bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[var(--color-success)]',
  bill: 'bg-[var(--color-danger-subtle)] border-[var(--color-danger)] text-[var(--color-danger)]',
  dirty: 'bg-[var(--color-bg-3)] border-[var(--color-border)] text-[var(--color-text-2)]'
}

export const FloorScreen = (): React.ReactElement => {
  const [zones, setZones] = useState<Zone[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [activeZone, setActiveZone] = useState<string>()
  const [selected, setSelected] = useState<RestaurantTable | null>(null)
  const [guests, setGuests] = useState(2)
  const session = useSessionStore((s) => s.session)
  const navigate = useNavigate()

  const load = useCallback(async (): Promise<void> => {
    const res = await window.api.floors.zones()
    if (res.ok) setZones(res.data as Zone[])
    const t = await window.api.floors.tables(undefined)
    if (t.ok) setTables(t.data)
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 5000) // live table status
    return () => clearInterval(t)
  }, [load])

  const zoneTables = activeZone ? tables.filter((t) => t.zoneId === activeZone) : tables

  const openTable = async (table: RestaurantTable): Promise<void> => {
    if (!session) return
    await window.api.tables.open({ tableId: table.id, guests })
    setSelected(null)
    navigate('/pos')
  }

  return (
    <div className="flex h-full">
      {/* Zones rail */}
      <div className="w-48 border-r border-[var(--color-border)] bg-[var(--color-bg-1)] p-2">
        <h2 className="mb-2 px-2 text-xs font-medium text-[var(--color-text-2)]">Zones</h2>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => setActiveZone(undefined)}
              aria-pressed={!activeZone}
              className={`w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${!activeZone ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]' : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'}`}
            >
              All zones
            </button>
          </li>
          {zones.map((z) => (
            <li key={z.id}>
              <button
                onClick={() => setActiveZone(z.id)}
                aria-pressed={activeZone === z.id}
                className={`w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${activeZone === z.id ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]' : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'}`}
              >
                {z.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Floor canvas */}
      <div className="relative flex-1 overflow-auto bg-[var(--color-bg-0)] p-6">
        {zoneTables.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="text-[var(--color-text-2)]">
              <UtensilsCrossed size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tables in this zone.</p>
              <p className="mt-1 text-xs">Floor editing is managed in Settings → Floors.</p>
            </div>
          </div>
        ) : (
          <div className="relative min-h-[800px]">
            {zoneTables.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                style={{
                  left: t.x,
                  top: t.y,
                  width: t.w,
                  height: t.h,
                  transform: `rotate(${t.rotation}deg)`
                }}
                className={`absolute flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 transition-colors ${STATUS_COLORS[t.status]} ${
                  t.shape === 'round' ? 'rounded-full' : ''
                }`}
                aria-label={`Table ${t.name}, ${t.status}`}
              >
                <span className="text-sm font-semibold">{t.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs opacity-80">
                  <Users size={11} /> {t.guests ?? 0}/{t.capacity}
                </span>
                <span className="mt-1 rounded bg-black/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  {t.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 border-l border-[var(--color-border)] bg-[var(--color-bg-1)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{selected.name}</h2>
            <button
              onClick={() => setSelected(null)}
              className="text-[var(--color-text-2)] hover:text-[var(--color-text-0)]"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-2)]">
            Capacity {selected.capacity} · {selected.status}
          </p>

          {selected.status === 'free' ? (
            <div className="mt-6">
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-1)]">
                Guests
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGuests(Math.max(1, guests - 1))}
                  className="h-9 w-9 rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                  aria-label="Fewer guests"
                >
                  −
                </button>
                <span className="nums w-10 text-center text-lg font-semibold">{guests}</span>
                <button
                  onClick={() => setGuests(Math.min(selected.capacity, guests + 1))}
                  className="h-9 w-9 rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                  aria-label="More guests"
                >
                  +
                </button>
              </div>
              <Button className="mt-4 w-full" onClick={() => void openTable(selected)}>
                Seat party of {guests}
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              <Button variant="secondary" className="w-full justify-start">
                View / add to order
              </Button>
              <Button variant="secondary" className="w-full justify-start">
                Split bill
              </Button>
              <Button variant="secondary" className="w-full justify-start">
                Transfer table
              </Button>
              <Button variant="secondary" className="w-full justify-start">
                Merge with…
              </Button>
              <Button variant="success" className="w-full">
                Request bill
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

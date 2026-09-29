import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Package, AlertTriangle, History } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { Badge } from '../../design-system/Badge'
import { Input } from '../../design-system/Input'
import { Modal } from '../../design-system/Modal'
import { Select } from '../../design-system/Select'
import { qty } from '@shared/lib/quantity'
import type { Product, StockMovement } from '@shared/types/models'
import { usePermission } from '../../stores/sessionStore'

const FMT = (m: number): string =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0
  }).format(m / 100)

type Tab = 'products' | 'movements' | 'lowstock'

export const InventoryScreen = (): React.ReactElement => {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('products')
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoadingList(true)
      try {
        const res = await window.api.products.list({ search, limit: 500 })
        if (res.ok) setProducts(res.data.items)
      } finally {
        setLoadingList(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [search, revision])

  useEffect(() => {
    if (tab !== 'movements') return
    void (async () => {
      const res = await window.api.inventory.movements(undefined, 200)
      if (res.ok) setMovements(res.data)
    })()
  }, [tab])

  const lowStock = useMemo(
    () =>
      products.filter(
        (p) => p.trackStock && p.lowStockThreshold != null && p.stockOnHand <= p.lowStockThreshold
      ),
    [products]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-1)] px-4 py-3">
        <h1 className="text-base font-semibold">Inventory</h1>
        <div className="flex gap-1" role="tablist" aria-label="Inventory views">
          {(['products', 'movements', 'lowstock'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] ${
                tab === t
                  ? 'bg-[var(--color-accent-subtle)] font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)]'
              }`}
            >
              {t === 'lowstock' ? `Low Stock (${lowStock.length})` : t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'products' && (
        <>
          <div className="shrink-0 border-b border-[var(--color-border)] p-3">
            <div className="relative max-w-sm">
              <Search
                size={15}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-2)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products"
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] ps-9 pe-3 text-sm text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-2)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
              />
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto"
            tabIndex={0}
            role="region"
            aria-label="Product list"
          >
            {loadingList ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-2)]">Loading…</div>
            ) : products.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Package
                  size={28}
                  className="mb-2 text-[var(--color-text-2)] opacity-40"
                  aria-hidden
                />
                <p className="text-sm font-medium text-[var(--color-text-1)]">No products found</p>
                <p className="mt-1 text-xs text-[var(--color-text-2)]">
                  Try a different name or SKU.
                </p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-start">Product</th>
                    <th className="text-start">SKU</th>
                    <th className="text-end">Price</th>
                    <th className="text-end">Cost</th>
                    <th className="text-end">Stock</th>
                    <th className="text-start">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const low =
                      p.trackStock &&
                      p.lowStockThreshold != null &&
                      p.stockOnHand <= p.lowStockThreshold
                    return (
                      <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-2)]">{p.sku}</td>
                        <td className="nums px-4 py-2.5 text-end">{FMT(p.price)}</td>
                        <td className="nums px-4 py-2.5 text-end text-[var(--color-text-1)]">
                          {FMT(p.cost)}
                        </td>
                        <td
                          className={`nums px-4 py-2.5 text-end ${low ? 'font-semibold text-[var(--color-warning)]' : ''}`}
                        >
                          {p.trackStock ? `${qty.format(p.stockOnHand)} ${p.unitCode}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {low && (
                            <Badge tone="warning">
                              <AlertTriangle size={11} aria-hidden /> Low
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'movements' && (
        <div
          className="min-h-0 flex-1 overflow-auto"
          tabIndex={0}
          role="region"
          aria-label="Stock movements"
        >
          {movements.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <History
                size={28}
                className="mb-2 text-[var(--color-text-2)] opacity-40"
                aria-hidden
              />
              <p className="text-sm font-medium text-[var(--color-text-1)]">
                No stock movements yet
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-2)]">
                Sales, refunds, and adjustments will appear here.
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-start">When</th>
                  <th className="text-start">Product</th>
                  <th className="text-start">Reason</th>
                  <th className="text-end">Change</th>
                  <th className="text-start">Ref</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-[var(--color-text-2)]">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{m.productId.slice(0, 8)}…</td>
                    <td className="px-4 py-2 capitalize">{m.reason}</td>
                    <td
                      className={`nums px-4 py-2 text-end font-medium ${m.qtyDelta >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
                    >
                      {m.qtyDelta >= 0 ? '+' : ''}
                      {qty.format(Math.abs(m.qtyDelta) * (m.qtyDelta >= 0 ? 1 : -1))}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--color-text-2)]">
                      {m.refType ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'lowstock' && (
        <div
          className="min-h-0 flex-1 overflow-auto p-4"
          tabIndex={0}
          role="region"
          aria-label="Low stock alerts"
        >
          {lowStock.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Package
                size={28}
                className="mb-2 text-[var(--color-text-2)] opacity-40"
                aria-hidden
              />
              <p className="text-sm font-medium text-[var(--color-text-1)]">
                No products below reorder threshold.
              </p>
            </div>
          ) : (
            <div className="mx-auto grid max-w-2xl gap-2">
              {lowStock.map((p) => (
                <div key={p.id} className="panel flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="nums mt-0.5 text-xs text-[var(--color-text-2)]">
                      {qty.format(p.stockOnHand)} {p.unitCode} remaining · reorder at{' '}
                      {qty.format(p.lowStockThreshold ?? 0)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone="warning">
                      <AlertTriangle size={11} aria-hidden /> Low
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate('/purchasing')}
                      aria-label={`Create purchase order for ${p.name}`}
                    >
                      Reorder
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <ProductDetail
          product={selected}
          onClose={() => setSelected(null)}
          onAdjusted={() => setRevision((v) => v + 1)}
        />
      )}
    </div>
  )
}

function ProductDetail({
  product,
  onClose,
  onAdjusted
}: {
  product: Product
  onClose: () => void
  onAdjusted: () => void
}): React.ReactElement {
  const canAdjust = usePermission('inventory.adjust')
  const [adjusting, setAdjusting] = useState(false)
  return (
    <Modal open onOpenChange={onClose} title={product.name} description={product.sku} width="lg">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Detail label="Price" value={FMT(product.price)} />
        <Detail label="Cost" value={FMT(product.cost)} />
        <Detail
          label="Margin"
          value={`${(((product.price - product.cost) / product.price) * 100).toFixed(1)}%`}
        />
        <Detail
          label="Stock"
          value={
            product.trackStock
              ? `${qty.format(product.stockOnHand)} ${product.unitCode}`
              : 'Not tracked'
          }
        />
        {product.lowStockThreshold != null && (
          <Detail
            label="Reorder at"
            value={`${qty.format(product.lowStockThreshold)} ${product.unitCode}`}
          />
        )}
        <Detail label="Unit" value={product.unitCode} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {canAdjust && product.trackStock && (
          <Button variant="secondary" onClick={() => setAdjusting(true)}>
            Adjust stock
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
      {adjusting && (
        <AdjustStockModal
          product={product}
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false)
            onAdjusted()
            onClose()
          }}
        />
      )}
    </Modal>
  )
}

function AdjustStockModal({
  product,
  onClose,
  onSaved
}: {
  product: Product
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const [deltaText, setDeltaText] = useState('')
  const [reason, setReason] = useState<'adjustment' | 'waste'>('adjustment')
  const [note, setNote] = useState('')
  const [managerPin, setManagerPin] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  const parsed = Number(deltaText)
  const valid =
    deltaText.trim() !== '' &&
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed !== 0 &&
    note.trim().length >= 2 &&
    managerPin.trim().length >= 4

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting.current || !valid) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await window.api.inventory.adjust({
        productId: product.id,
        qtyDeltaMilli: parsed * 1000,
        reason,
        note: note.trim(),
        managerPin: managerPin.trim()
      })
      if (!result.ok) setError(result.error.message)
      else onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to adjust stock.')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose()
      }}
      title={`Adjust stock — ${product.name}`}
      description="Requires a manager PIN. Every adjustment is written to the stock ledger and audit log."
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-busy={pending}>
        {error && (
          <div
            role="alert"
            className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]"
          >
            {error}
          </div>
        )}
        <p className="text-sm text-[var(--color-text-1)]">
          Current stock:{' '}
          <span className="nums font-semibold">
            {qty.format(product.stockOnHand)} {product.unitCode}
          </span>
        </p>
        <fieldset disabled={pending} className="space-y-4">
          <Input
            label="Quantity change (whole units, negative to reduce)"
            type="number"
            step={1}
            required
            value={deltaText}
            onChange={(e) => setDeltaText(e.target.value)}
            hint="Example: 5 adds five units; -2 removes two."
          />
          <Select
            label="Reason"
            value={reason}
            onChange={(v) => setReason(v as 'adjustment' | 'waste')}
            options={[
              { value: 'adjustment', label: 'Adjustment / correction' },
              { value: 'waste', label: 'Waste / spoilage' }
            ]}
          />
          <Input label="Note" required value={note} onChange={(e) => setNote(e.target.value)} />
          <Input
            label="Manager PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
          />
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => !submitting.current && onClose()}
          >
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={!valid}>
            Record adjustment
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const Detail = ({ label, value }: { label: string; value: string }): React.ReactElement => (
  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-2)] p-3">
    <p className="text-xs text-[var(--color-text-2)]">{label}</p>
    <p className="nums mt-1 font-semibold">{value}</p>
  </div>
)

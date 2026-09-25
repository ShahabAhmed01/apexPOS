import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PurchaseOrderInput, SupplierInput } from '@shared/ipc/api'
import type { Product, PurchaseOrder, Supplier } from '@shared/types/models'
import { format } from '@shared/lib/money'
import { Button } from '../../design-system/Button'
import { Input } from '../../design-system/Input'
import { Modal } from '../../design-system/Modal'
import { Select } from '../../design-system/Select'
import { usePermission } from '../../stores/sessionStore'

const money = (amount: number): string => format(amount, { currency: 'PKR', locale: 'en-PK' })

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const ErrorAlert = ({ message }: { message: string }): React.ReactElement => (
  <div
    role="alert"
    className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]"
  >
    {message}
  </div>
)

const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const
type PoStatus = (typeof PO_STATUSES)[number]

const statusLabelKey: Record<PoStatus, string> = {
  draft: 'purchasing.draft',
  sent: 'purchasing.sent',
  partial: 'purchasing.partial',
  received: 'purchasing.receivedStatus',
  cancelled: 'purchasing.cancelled'
}

const statusBadgeClass: Record<PoStatus, string> = {
  draft: 'bg-[var(--color-bg-3)] text-[var(--color-text-1)]',
  sent: 'bg-[var(--color-info-subtle,var(--color-bg-3))] text-[var(--color-accent)]',
  partial: 'bg-[var(--color-warning-subtle,var(--color-bg-3))] text-[var(--color-warning,#b7791f)]',
  received: 'bg-[var(--color-success-subtle,var(--color-bg-3))] text-[var(--color-success)]',
  cancelled: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]'
}

export const PurchasingScreen = (): React.ReactElement => {
  const { t } = useTranslation()
  const canView = usePermission('purchases.view')
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders')
  const [revision, setRevision] = useState(0)
  const refresh = (): void => setRevision((v) => v + 1)

  if (!canView) {
    return (
      <p role="alert" className="p-6 text-sm text-[var(--color-text-1)]">
        {t('errors.forbiddenDraw')}
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Truck size={18} aria-hidden /> {t('purchasing.title')}
        </h1>
        <div role="tablist" aria-label={t('purchasing.title')} className="flex gap-1">
          <button
            role="tab"
            aria-selected={tab === 'orders'}
            onClick={() => setTab('orders')}
            className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-sm ${
              tab === 'orders'
                ? 'bg-[var(--color-accent-solid)] text-white'
                : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'
            }`}
          >
            {t('purchasing.purchaseOrders')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'suppliers'}
            onClick={() => setTab('suppliers')}
            className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-sm ${
              tab === 'suppliers'
                ? 'bg-[var(--color-accent-solid)] text-white'
                : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'
            }`}
          >
            {t('purchasing.suppliers')}
          </button>
        </div>
      </div>
      {tab === 'orders' ? (
        <PurchaseOrdersTab revision={revision} onChanged={refresh} />
      ) : (
        <SuppliersTab revision={revision} onChanged={refresh} />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Suppliers
 * ------------------------------------------------------------------------ */

function SuppliersTab({
  revision,
  onChanged
}: {
  revision: number
  onChanged: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const canManage = usePermission('purchases.create')
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    const version = ++requestVersion.current
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await window.api.suppliers.list(search.trim() || undefined)
          if (version !== requestVersion.current) return
          if (result.ok) setSuppliers(result.data)
          else setError(result.error.message)
        } catch (err) {
          if (version === requestVersion.current) setError(errorMessage(err, t('errors.generic')))
        } finally {
          if (version === requestVersion.current) setLoading(false)
        }
      })()
    }, 200)
    return () => {
      clearTimeout(timer)
      requestVersion.current += 1
    }
  }, [search, revision, t])

  return (
    <>
      <div className="mt-4 flex items-end gap-3">
        <div className="max-w-sm flex-1">
          <Input
            label={t('common.search')}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden /> {t('purchasing.newSupplier')}
          </Button>
        )}
      </div>
      <div
        className="mt-4 min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="region"
        aria-busy={loading}
      >
        {loading ? (
          <p role="status" className="py-8 text-center text-sm text-[var(--color-text-2)]">
            {t('app.loading')}
          </p>
        ) : error ? (
          <ErrorAlert message={error} />
        ) : (
          <table className="w-full text-sm" aria-label={t('purchasing.suppliers')}>
            <thead className="sticky top-0 bg-[var(--color-bg-1)]">
              <tr className="border-b border-[var(--color-border)] text-start text-xs text-[var(--color-text-2)]">
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t('common.name')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t('purchasing.contact')}
                </th>
                {canManage && (
                  <th scope="col" className="px-4 py-2 text-end font-medium">
                    {t('common.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-1)]"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-1)]">
                    <p>{s.contactName || '—'}</p>
                    <p className="text-xs">
                      {[s.phone, s.email].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`${t('common.edit')} ${s.name}`}
                        onClick={() => setEditing(s)}
                      >
                        {t('common.edit')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && editing && (
        <SupplierModal
          supplier={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function SupplierModal({
  supplier,
  onClose,
  onSaved
}: {
  supplier?: Supplier
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const [input, setInput] = useState<SupplierInput>(() => ({
    id: supplier?.id,
    name: supplier?.name ?? '',
    contactName: supplier?.contactName ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? ''
  }))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting.current) return
    if (!input.name.trim()) {
      setError(t('common.required'))
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await window.api.suppliers.save({
        ...input,
        name: input.name.trim(),
        contactName: input.contactName?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        address: input.address?.trim() || undefined
      })
      if (!result.ok) setError(result.error.message)
      else onSaved()
    } catch (err) {
      setError(errorMessage(err, t('errors.generic')))
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
      title={supplier ? `${t('common.edit')} — ${supplier.name}` : t('purchasing.newSupplier')}
      width="lg"
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" aria-busy={pending}>
        {error && <ErrorAlert message={error} />}
        <fieldset disabled={pending} className="space-y-4">
          <Input
            label={t('common.name')}
            value={input.name}
            required
            onChange={(e) => setInput({ ...input, name: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('purchasing.contact')}
              value={input.contactName}
              onChange={(e) => setInput({ ...input, contactName: e.target.value })}
            />
            <Input
              label={t('onboarding.business.phone')}
              type="tel"
              value={input.phone}
              onChange={(e) => setInput({ ...input, phone: e.target.value })}
            />
          </div>
          <Input
            label={t('onboarding.business.email')}
            type="email"
            value={input.email}
            onChange={(e) => setInput({ ...input, email: e.target.value })}
          />
          <Input
            label={t('onboarding.business.address')}
            value={input.address}
            onChange={(e) => setInput({ ...input, address: e.target.value })}
          />
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => !submitting.current && onClose()}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={pending} disabled={!input.name.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Purchase orders
 * ------------------------------------------------------------------------ */

function PurchaseOrdersTab({
  revision,
  onChanged
}: {
  revision: number
  onChanged: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const canCreate = usePermission('purchases.create')
  const [status, setStatus] = useState<PoStatus | ''>('')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const result = await window.api.purchaseOrders.list(status || undefined)
        if (cancelled) return
        if (result.ok) setOrders(result.data)
        else setError(result.error.message)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, t('errors.generic')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, revision, t])

  const openSelected = async (id: string): Promise<void> => {
    const result = await window.api.purchaseOrders.get(id)
    if (result.ok) setSelected(result.data)
    else setError(result.error.message)
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatus('')}
          className={`rounded-full px-3 py-1 text-xs ${
            status === ''
              ? 'bg-[var(--color-accent-solid)] text-white'
              : 'bg-[var(--color-bg-2)] text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]'
          }`}
        >
          {t('common.status')}: *
        </button>
        {PO_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs ${
              status === s
                ? 'bg-[var(--color-accent-solid)] text-white'
                : 'bg-[var(--color-bg-2)] text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]'
            }`}
          >
            {t(statusLabelKey[s])}
          </button>
        ))}
        <div className="ms-auto">
          {canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> {t('purchasing.newPo')}
            </Button>
          )}
        </div>
      </div>
      <div
        className="mt-4 min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="region"
        aria-busy={loading}
      >
        {loading ? (
          <p role="status" className="py-8 text-center text-sm text-[var(--color-text-2)]">
            {t('app.loading')}
          </p>
        ) : error ? (
          <ErrorAlert message={error} />
        ) : orders.length === 0 ? (
          <p role="status" className="py-8 text-center text-sm text-[var(--color-text-2)]">
            —
          </p>
        ) : (
          <table className="w-full text-sm" aria-label={t('purchasing.purchaseOrders')}>
            <thead className="sticky top-0 bg-[var(--color-bg-1)]">
              <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-2)]">
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t('purchasing.poNumber')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t('purchasing.supplier')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t('common.status')}
                </th>
                <th scope="col" className="px-4 py-2 text-end font-medium">
                  {t('purchasing.items')}
                </th>
                <th scope="col" className="px-4 py-2 text-end font-medium">
                  {t('common.total')}
                </th>
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t('purchasing.expected')}
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr
                  key={po.id}
                  onClick={() => void openSelected(po.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void openSelected(po.id)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`PO #${po.number} — ${po.supplierName}`}
                  className="cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-bg-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                >
                  <td className="nums px-4 py-3 font-medium">#{po.number}</td>
                  <td className="px-4 py-3">{po.supplierName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass[po.status]}`}
                    >
                      {t(statusLabelKey[po.status])}
                    </span>
                  </td>
                  <td className="nums px-4 py-3 text-end">{po.items.length}</td>
                  <td className="nums px-4 py-3 text-end">
                    {money(po.items.reduce((a, i) => a + i.unitCost * (i.qtyOrdered / 1000), 0))}
                  </td>
                  <td className="nums px-4 py-3 text-[var(--color-text-1)]">
                    {po.expectedAt ? po.expectedAt.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && (
        <PoCreateModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            onChanged()
          }}
        />
      )}
      {selected && (
        <PoDetailModal
          poId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function PoCreateModal({
  onClose,
  onSaved
}: {
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<PurchaseOrderInput['items']>([])
  const [productSearch, setProductSearch] = useState('')
  const [matches, setMatches] = useState<Product[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    void window.api.suppliers.list().then((r) => {
      if (r.ok) setSuppliers(r.data)
    })
  }, [])

  useEffect(() => {
    if (!productSearch.trim()) {
      setMatches([])
      return
    }
    const timer = setTimeout(() => {
      void window.api.products.search(productSearch.trim()).then((r) => {
        if (r.ok) setMatches(r.data.filter((p) => p.type !== 'variant_parent').slice(0, 8))
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [productSearch])

  const addLine = (product: Product): void => {
    if (lines.some((l) => l.productId === product.id)) return
    setLines([...lines, { productId: product.id, qtyMilli: 1000, unitCost: product.cost }])
    setProductSearch('')
    setMatches([])
  }

  const total = useMemo(
    () => lines.reduce((a, l) => a + l.unitCost * (l.qtyMilli / 1000), 0),
    [lines]
  )

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting.current) return
    if (!supplierId || lines.length === 0) {
      setError(t('common.required'))
      return
    }
    for (const l of lines) {
      if (!Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0 || l.qtyMilli % 1000 !== 0) {
        setError(t('purchasing.validation.qtyPositive'))
        return
      }
      if (!Number.isInteger(l.unitCost) || l.unitCost < 0) {
        setError(t('purchasing.validation.qtyPositive'))
        return
      }
    }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await window.api.purchaseOrders.create({
        supplierId,
        expectedAt: expectedAt || undefined,
        notes: notes.trim() || undefined,
        items: lines
      })
      if (!result.ok) setError(result.error.message)
      else onSaved()
    } catch (err) {
      setError(errorMessage(err, t('errors.generic')))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  const [nameCache, setNameCache] = useState<Record<string, string>>({})
  const lineName = (productId: string): string => nameCache[productId] ?? productId.slice(0, 8)
  const recordName = (p: Product): void =>
    setNameCache((prev) => ({ ...prev, [p.id]: `${p.name} (${p.sku})` }))

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose()
      }}
      title={t('purchasing.newPo')}
      width="lg"
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="max-h-[75vh] space-y-4 overflow-y-auto"
        aria-busy={pending}
      >
        {error && <ErrorAlert message={error} />}
        <fieldset disabled={pending} className="space-y-4">
          <Select
            label={t('purchasing.supplier')}
            value={supplierId}
            onChange={(value) => setSupplierId(value)}
            options={[
              { value: '', label: '—' },
              ...suppliers.map((s) => ({ value: s.id, label: s.name }))
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('purchasing.expected')}
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
            />
            <Input
              label={t('common.notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="relative">
            <Input
              label={t('pos.searchPlaceholder')}
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {matches.length > 0 && (
              <ul
                role="listbox"
                className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] shadow-lg"
              >
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-[var(--color-bg-2)]"
                      onClick={() => {
                        recordName(p)
                        addLine(p)
                      }}
                    >
                      <span>
                        {p.name} <span className="text-[var(--color-text-2)]">({p.sku})</span>
                      </span>
                      <span className="nums text-[var(--color-text-1)]">{money(p.cost)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length > 0 && (
            <table className="w-full text-sm" aria-label={t('purchasing.items')}>
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-2)]">
                  <th scope="col" className="px-2 py-1 text-start font-medium">
                    {t('common.name')}
                  </th>
                  <th scope="col" className="nums px-2 py-1 text-end font-medium">
                    {t('common.quantity')}
                  </th>
                  <th scope="col" className="nums px-2 py-1 text-end font-medium">
                    {t('purchasing.unitCost')}
                  </th>
                  <th scope="col" className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.productId} className="border-b border-[var(--color-border)]">
                    <td className="px-2 py-1">{lineName(line.productId)}</td>
                    <td className="px-2 py-1 text-end">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        aria-label={`${t('common.quantity')} — ${lineName(line.productId)}`}
                        className="nums w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-2 py-1 text-end"
                        value={line.qtyMilli / 1000}
                        onChange={(e) => {
                          const qty = Math.max(1, Math.floor(Number(e.target.value) || 0))
                          const next = [...lines]
                          next[index] = { ...line, qtyMilli: qty * 1000 }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 text-end">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label={`${t('purchasing.unitCost')} — ${lineName(line.productId)}`}
                        className="nums w-28 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-2 py-1 text-end"
                        value={line.unitCost / 100}
                        onChange={(e) => {
                          const major = Number(e.target.value)
                          const minor = Number.isFinite(major) ? Math.round(major * 100) : 0
                          const next = [...lines]
                          next[index] = { ...line, unitCost: Math.max(0, minor) }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 text-end">
                      <button
                        type="button"
                        aria-label={`${t('common.delete')} — ${lineName(line.productId)}`}
                        className="text-[var(--color-danger)] hover:underline"
                        onClick={() => setLines(lines.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="nums text-end text-sm font-semibold">
            {t('common.total')}: {money(total)}
          </p>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => !submitting.current && onClose()}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={pending} disabled={!supplierId || lines.length === 0}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function PoDetailModal({
  poId,
  onClose,
  onChanged
}: {
  poId: string
  onClose: () => void
  onChanged: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const canApprove = usePermission('purchases.approve')
  const canReceive = usePermission('purchases.receive')
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  // Stable per dialog-open op id so a double-click / retry never double-receives.
  const opId = useRef(crypto.randomUUID())

  const load = async (): Promise<void> => {
    const result = await window.api.purchaseOrders.get(poId)
    if (result.ok) setPo(result.data)
    else setError(result.error.message)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId])

  const act = async (
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>
  ): Promise<void> => {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await fn()
      if (!result.ok) {
        setError(result.error?.message ?? t('errors.generic'))
      } else {
        onChanged()
      }
    } catch (err) {
      setError(errorMessage(err, t('errors.generic')))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  const receive = async (): Promise<void> => {
    const received = (po?.items ?? [])
      .map((item) => ({ itemId: item.id, qtyMilli: Math.round((receiveQty[item.id] ?? 0) * 1000) }))
      .filter((r) => r.qtyMilli > 0)
    if (received.length === 0) {
      setError(t('purchasing.validation.qtyPositive'))
      return
    }
    await act(() => window.api.purchaseOrders.receivePartial(poId, received, opId.current))
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose()
      }}
      title={po ? `PO #${po.number} — ${po.supplierName}` : t('purchasing.purchaseOrders')}
      width="lg"
    >
      {!po ? (
        <p role="status" className="py-6 text-center text-sm text-[var(--color-text-2)]">
          {t('app.loading')}
        </p>
      ) : (
        <div className="max-h-[75vh] space-y-4 overflow-y-auto" aria-busy={pending}>
          {error && <ErrorAlert message={error} />}
          <div className="flex items-center gap-3 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass[po.status]}`}>
              {t(statusLabelKey[po.status])}
            </span>
            {po.expectedAt && (
              <span className="nums text-[var(--color-text-1)]">
                {t('purchasing.expected')}: {po.expectedAt.slice(0, 10)}
              </span>
            )}
          </div>
          {po.notes && <p className="text-sm text-[var(--color-text-1)]">{po.notes}</p>}
          <table className="w-full text-sm" aria-label={t('purchasing.items')}>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-2)]">
                <th scope="col" className="px-2 py-1 text-start font-medium">
                  {t('common.name')}
                </th>
                <th scope="col" className="nums px-2 py-1 text-end font-medium">
                  {t('purchasing.ordered')}
                </th>
                <th scope="col" className="nums px-2 py-1 text-end font-medium">
                  {t('purchasing.received')}
                </th>
                <th scope="col" className="nums px-2 py-1 text-end font-medium">
                  {t('purchasing.remaining')}
                </th>
                <th scope="col" className="nums px-2 py-1 text-end font-medium">
                  {t('purchasing.unitCost')}
                </th>
                {(po.status === 'sent' || po.status === 'partial') && canReceive && (
                  <th scope="col" className="nums px-2 py-1 text-end font-medium">
                    {t('purchasing.receiveNow')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {po.items.map((item) => {
                const remaining = item.qtyOrdered - item.qtyReceived
                return (
                  <tr key={item.id} className="border-b border-[var(--color-border)]">
                    <td className="px-2 py-1">
                      {item.name} <span className="text-[var(--color-text-2)]">({item.sku})</span>
                    </td>
                    <td className="nums px-2 py-1 text-end">{item.qtyOrdered / 1000}</td>
                    <td className="nums px-2 py-1 text-end">{item.qtyReceived / 1000}</td>
                    <td className="nums px-2 py-1 text-end">{remaining / 1000}</td>
                    <td className="nums px-2 py-1 text-end">{money(item.unitCost)}</td>
                    {(po.status === 'sent' || po.status === 'partial') && canReceive && (
                      <td className="px-2 py-1 text-end">
                        <input
                          type="number"
                          min={0}
                          max={remaining / 1000}
                          step={1}
                          aria-label={`${t('purchasing.receiveNow')} — ${item.name}`}
                          className="nums w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-2 py-1 text-end"
                          value={receiveQty[item.id] ?? 0}
                          onChange={(e) => {
                            const qty = Math.max(
                              0,
                              Math.min(remaining / 1000, Math.floor(Number(e.target.value) || 0))
                            )
                            setReceiveQty({ ...receiveQty, [item.id]: qty })
                          }}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap justify-end gap-2">
            {po.status === 'draft' && canApprove && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => void act(() => window.api.purchaseOrders.send(po.id))}
              >
                {t('purchasing.send')}
              </Button>
            )}
            {(po.status === 'sent' || po.status === 'partial') && canReceive && (
              <Button disabled={pending} onClick={() => void receive()} loading={pending}>
                {t('purchasing.receive')}
              </Button>
            )}
            {(po.status === 'draft' || po.status === 'sent') && canApprove && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => void act(() => window.api.purchaseOrders.cancel(po.id))}
              >
                {t('purchasing.cancelPo')}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => !submitting.current && onClose()}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

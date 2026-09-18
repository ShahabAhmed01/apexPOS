import { useEffect, useRef, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import type { CustomerInput } from '@shared/ipc/api'
import type { Customer } from '@shared/types/models'
import { format } from '@shared/lib/money'
import { Button } from '../../design-system/Button'
import { Input } from '../../design-system/Input'
import { Modal } from '../../design-system/Modal'
import { usePermission } from '../../stores/sessionStore'

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const ErrorAlert = ({ message }: { message: string }): React.ReactElement => (
  <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]">
    {message}
  </div>
)

export const CustomersScreen = (): React.ReactElement => {
  const canView = usePermission('customers.view')
  const canManage = usePermission('customers.manage')
  const canCredit = usePermission('customers.credit')
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<Customer | null>(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    const version = ++requestVersion.current
    setCustomers([])
    setError(null)
    setLoading(canView)
    if (!canView) return
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await window.api.customers.list(search.trim() || undefined)
          if (version !== requestVersion.current) return
          if (result.ok) setCustomers(result.data)
          else setError(result.error.message)
        } catch (err) {
          if (version === requestVersion.current) {
            setError(errorMessage(err, 'Unable to load customers.'))
          }
        } finally {
          if (version === requestVersion.current) setLoading(false)
        }
      })()
    }, 200)
    return () => {
      clearTimeout(timer)
      requestVersion.current += 1
    }
  }, [search, revision, canView])

  const refresh = (): void => {
    requestVersion.current += 1
    setLoading(true)
    setError(null)
    setRevision((value) => value + 1)
  }

  if (!canView) {
    return <p role="alert" className="p-6 text-sm text-[var(--color-text-1)]">You do not have permission to view customers.</p>
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold"><Users size={18} aria-hidden /> Customers</h1>
        {canManage && (
          <Button onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> New customer</Button>
        )}
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="max-w-sm flex-1">
          <Input
            label="Search customers"
            type="search"
            placeholder="Search customers…"
            value={search}
            onChange={(event) => {
              requestVersion.current += 1
              setLoading(true)
              setError(null)
              setSearch(event.target.value)
            }}
          />
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>Refresh</Button>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-auto" aria-busy={loading}>
        {loading ? (
          <p role="status" className="py-8 text-center text-sm text-[var(--color-text-2)]">Loading customers…</p>
        ) : error ? (
          <div className="space-y-3">
            <ErrorAlert message={error} />
            <Button variant="secondary" onClick={refresh}>Retry</Button>
          </div>
        ) : customers.length === 0 ? (
          <p role="status" className="py-8 text-center text-sm text-[var(--color-text-2)]">
            {search.trim() ? 'No customers match your search.' : 'No customers yet.'}
          </p>
        ) : (
          <table className="w-full text-sm" aria-label="Customers">
            <thead className="sticky top-0 bg-[var(--color-bg-1)]">
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-2)]">
                <th scope="col" className="px-4 py-2 font-medium">Customer</th>
                <th scope="col" className="px-4 py-2 font-medium">Contact</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Loyalty points</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Store credit</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Total spent</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Orders</th>
                {(canManage || canCredit) && <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-1)]">
                  <td className="px-4 py-3">
                    <p className="font-medium">{customer.name}</p>
                    {!customer.isActive && <p className="text-xs text-[var(--color-text-2)]">Inactive</p>}
                    {customer.tags.length > 0 && <p className="text-xs text-[var(--color-text-2)]">{customer.tags.join(', ')}</p>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-1)]">
                    <p>{customer.phone || '—'}</p>
                    <p>{customer.email || '—'}</p>
                  </td>
                  <td className="nums px-4 py-3 text-right">{customer.loyaltyPoints.toLocaleString()}</td>
                  <td className="nums whitespace-nowrap px-4 py-3 text-right">{format(customer.storeCredit, { currency: 'PKR', locale: 'en-PK' })}</td>
                  <td className="nums whitespace-nowrap px-4 py-3 text-right">{format(customer.totalSpent, { currency: 'PKR', locale: 'en-PK' })}</td>
                  <td className="nums px-4 py-3 text-right">{customer.orderCount.toLocaleString()}</td>
                  {(canManage || canCredit) && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canManage && <Button size="sm" variant="secondary" aria-label={`Edit ${customer.name}`} onClick={() => setEditing(customer)}>Edit</Button>}
                        {canCredit && <Button size="sm" variant="secondary" aria-label={`Adjust loyalty for ${customer.name}`} onClick={() => setLoyaltyCustomer(customer)}>Adjust loyalty</Button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && editing && (
        <CustomerModal
          customer={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
      {canCredit && loyaltyCustomer && (
        <LoyaltyModal
          customer={loyaltyCustomer}
          onClose={() => setLoyaltyCustomer(null)}
          onSaved={() => {
            setLoyaltyCustomer(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function CustomerModal({ customer, onClose, onSaved }: {
  customer?: Customer
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const canManage = usePermission('customers.manage')
  const [input, setInput] = useState<CustomerInput>(() => ({
    id: customer?.id,
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
    tags: customer?.tags ?? []
  }))
  const [tags, setTags] = useState(customer?.tags.join(', ') ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const close = (): void => {
    if (!submitting.current) onClose()
  }

  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting.current || !canManage) return
    if (!input.name.trim()) {
      setError('Customer name is required.')
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await window.api.customers.save({
        ...input,
        name: input.name.trim(),
        phone: input.phone?.trim(),
        email: input.email?.trim(),
        address: input.address?.trim(),
        notes: input.notes?.trim()
      })
      if (!result.ok) setError(result.error.message)
      else onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Unable to save customer.'))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Modal open onOpenChange={(open) => { if (!open) close() }} title={customer ? 'Edit customer' : 'New customer'} description="Manage customer contact details and notes." width="lg">
      <form onSubmit={(event) => void save(event)} className="max-h-[70vh] space-y-4 overflow-y-auto" aria-busy={pending}>
        {error && <ErrorAlert message={error} />}
        <fieldset disabled={pending} className="space-y-4">
          <Input label="Name" value={input.name} required onChange={(event) => setInput({ ...input, name: event.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Phone" type="tel" value={input.phone} onChange={(event) => setInput({ ...input, phone: event.target.value })} />
            <Input label="Email" type="email" value={input.email} onChange={(event) => setInput({ ...input, email: event.target.value })} />
          </div>
          <Input label="Address" value={input.address} onChange={(event) => setInput({ ...input, address: event.target.value })} />
          <label className="block text-xs font-medium text-[var(--color-text-1)]">
            Notes
            <textarea
              value={input.notes}
              rows={3}
              onChange={(event) => setInput({ ...input, notes: event.target.value })}
              className="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <Input label="Tags" hint="Separate tags with commas." value={tags} onChange={(event) => {
            setTags(event.target.value)
            setInput({ ...input, tags: [...new Set(event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))] })
          }} />
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
          <Button type="submit" loading={pending} disabled={!canManage || !input.name.trim()}>{pending ? 'Saving…' : 'Save customer'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function LoyaltyModal({ customer, onClose, onSaved }: {
  customer: Customer
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const canCredit = usePermission('customers.credit')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const points = Number(delta)
  const validDelta = /^[+-]?\d+$/.test(delta.trim()) && Number.isSafeInteger(points) && points !== 0
  const close = (): void => {
    if (!submitting.current) onClose()
  }

  const adjust = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting.current || !canCredit) return
    if (!validDelta || !reason.trim()) {
      setError('Enter a non-zero whole number of points and a reason.')
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await window.api.customers.adjustLoyalty(customer.id, points, reason.trim())
      if (!result.ok) setError(result.error.message)
      else onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Unable to adjust loyalty points.'))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Modal open onOpenChange={(open) => { if (!open) close() }} title="Adjust loyalty" description={customer.name}>
      <form onSubmit={(event) => void adjust(event)} className="space-y-4" aria-busy={pending}>
        <p className="text-sm text-[var(--color-text-1)]">Current balance: <span className="nums font-semibold">{customer.loyaltyPoints.toLocaleString()}</span> points</p>
        {error && <ErrorAlert message={error} />}
        <fieldset disabled={pending} className="space-y-4">
          <Input label="Points adjustment" type="number" step="1" required value={delta} onChange={(event) => setDelta(event.target.value)} hint="Use positive points to add or negative points to deduct." />
          <Input label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} />
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
          <Button type="submit" loading={pending} disabled={!canCredit || !validDelta || !reason.trim()}>{pending ? 'Adjusting…' : 'Adjust points'}</Button>
        </div>
      </form>
    </Modal>
  )
}

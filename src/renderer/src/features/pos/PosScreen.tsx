import { useState, useEffect, useRef, useCallback } from 'react'
import { ShoppingCart, Trash2, Pause, Percent, Search, Scan, ShoppingBag } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../design-system/Button'
import { Modal } from '../../design-system/Modal'
import { useCartStore, type CartLine } from './cartStore'
import { computeTotals } from './computeTotals'
import { qty } from '@shared/lib/quantity'
import type { Product, Order } from '@shared/types/models'
import { useQueryClient } from '@tanstack/react-query'

const FMT = (m: number): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency: 'PKR' }).format(m / 100)

export const PosScreen = (): React.ReactElement => {
  const {
    lines,
    cartDiscount,
    customerId,
    orderType,
    addProduct,
    removeLine,
    setQuantity,
    setLineDiscount,
    setCartDiscount,
    setOrderType,
    clear,
    loadFromOrder
  } = useCartStore()
  const queryClient = useQueryClient()

  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [heldOrders, setHeldOrders] = useState<Order[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdName, setHoldName] = useState('')
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent')
  const [discountValue, setDiscountValue] = useState('10')
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heldOrderId, setHeldOrderId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Dine-in handoff: /pos?order=<id> loads the table's active order into the
  // cart so service adds to the SAME order the floor plan tracks.
  useEffect(() => {
    const orderId = searchParams.get('order')
    if (!orderId) return
    void (async () => {
      const res = await window.api.orders.get(orderId)
      if (!res.ok) {
        setError(res.error.message)
        setSearchParams({}, { replace: true })
        return
      }
      const order = res.data
      const orderLines: CartLine[] = order.lines.map((l) => ({
        lineId: `line-${crypto.randomUUID()}`,
        productId: l.productId,
        variantId: l.variantId,
        sku: l.sku,
        name: l.name,
        unitPrice: l.unitPrice,
        quantityMilli: l.quantity,
        isWeighted: l.quantity % 1000 !== 0,
        unitCode: 'pc',
        discountMinor: l.lineDiscount,
        notes: l.notes,
        taxBps: l.taxBps
      }))
      loadFromOrder(order.id, orderLines)
      if (order.type === 'dine_in') setOrderType('dine_in')
      else if (order.type === 'takeaway') setOrderType('takeaway')
      setHeldOrderId(order.id)
      setTableBanner(order.tableId ? `Dine-in — table order ${order.numberLabel}` : null)
      setSearchParams({}, { replace: true })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const [tableBanner, setTableBanner] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  const addByProduct = useCallback(
    (p: Product) => {
      if (p.variants.length > 0) {
        // Variant parent → pick first variant by default (full P3 will open picker)
        addProduct(p, 1000, p.variants[0])
      } else {
        addProduct(p)
      }
      setError(null)
    },
    [addProduct]
  )

  // Barcode → instant add (keyboard-wedge behavior)
  useEffect(() => {
    const t = setTimeout(() => {
      const code = barcodeInput.trim()
      if (!code) return
      void (async () => {
        const res = await window.api.products.byBarcode(code)
        if (res.ok && res.data) {
          addByProduct(res.data)
          setBarcodeInput('')
        } else {
          setError(`Barcode not found: ${code}`)
          setTimeout(() => setError(null), 3000)
          setBarcodeInput('')
        }
      })()
    }, 60)
    return () => clearTimeout(t)
  }, [barcodeInput, addByProduct])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await window.api.products.search(search)
      if (res.ok) setProducts(res.data)
    }, 120)
    return () => clearTimeout(t)
  }, [search])

  // POS keyboard shortcuts (advertised on the tender buttons — keep them true):
  // F2 focuses search, F9 cash, F10 card, F11 mobile wallet, F4 hold.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'F9') {
        e.preventDefault()
        void onPay('cash')
      } else if (e.key === 'F10') {
        e.preventDefault()
        void onPay('card')
      } else if (e.key === 'F11') {
        e.preventDefault()
        void onPay('mobile_wallet')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, cartDiscount, customerId, orderType, heldOrderId])

  // Held orders poll
  const refreshHeld = useCallback(async () => {
    const res = await window.api.orders.listHeld()
    if (res.ok) setHeldOrders(res.data)
  }, [])
  useEffect(() => {
    void refreshHeld()
  }, [refreshHeld])

  useEffect(() => {
    searchRef.current?.focus()
    // Subscribe to cart changes → push to customer display in real time
    const unsub = useCartStore.subscribe((state) => {
      const totals = computeTotals(state.lines, state.cartDiscount)
      window.api.display.push({
        lines: state.lines.map((l) => ({
          name: l.name,
          quantityMilli: l.quantityMilli,
          unitPrice: l.unitPrice,
          total: Math.round((l.unitPrice * l.quantityMilli) / 1000) - l.discountMinor
        })),
        subtotal: totals.subtotal,
        tax: totals.taxTotal,
        total: totals.total,
        status: state.lines.length > 0 ? 'shopping' : 'idle'
      })
    })
    return unsub
  }, [])

  const totals = computeTotals(lines, cartDiscount)

  const onPay = async (
    method: 'cash' | 'card' | 'mobile_wallet',
    tendered?: number
  ): Promise<void> => {
    if (lines.length === 0) return
    setError(null)
    const opId = crypto.randomUUID()

    const base = {
      type: orderType,
      customerId,
      clientOpId: opId,
      lines: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantityMilli: l.quantityMilli,
        lineDiscountMinor: l.discountMinor || undefined,
        notes: l.notes
      })),
      cartDiscount: cartDiscount
        ? { kind: cartDiscount.kind, value: cartDiscount.value }
        : undefined
    }

    // Create or update order
    const createRes = heldOrderId
      ? await window.api.orders.updateDraft({ ...base, orderId: heldOrderId })
      : await window.api.orders.create(base)

    if (!createRes.ok) {
      setError(createRes.error.message)
      return
    }
    const order = createRes.data
    const total = order.total

    // Tender
    const tenderRes = await window.api.payments.tender({
      orderId: order.id,
      clientOpId: opId,
      payments: [{ method, amount: total, ...(tendered !== undefined ? { tendered } : {}) }]
    })

    if (!tenderRes.ok) {
      setError(tenderRes.error.message)
      return
    }
    setLastOrder(tenderRes.data)
    setPayOpen(true)
    clear()
    setHeldOrderId(null)
    setTableBanner(null)
    void refreshHeld()
    void queryClient.invalidateQueries()
  }

  const onHold = async (): Promise<void> => {
    if (lines.length === 0) return
    const opId = crypto.randomUUID()
    const res = await window.api.orders.create({
      type: orderType,
      customerId,
      holdName: holdName || undefined,
      clientOpId: opId,
      lines: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantityMilli: l.quantityMilli,
        lineDiscountMinor: l.discountMinor || undefined,
        notes: l.notes
      })),
      cartDiscount: cartDiscount
        ? { kind: cartDiscount.kind, value: cartDiscount.value }
        : undefined
    })
    if (res.ok) {
      const held = await window.api.orders.hold(res.data.id, holdName || undefined)
      if (held.ok) {
        clear()
        setHoldOpen(false)
        setHoldName('')
        setHeldOrderId(null)
        void refreshHeld()
      }
    } else {
      setError(res.error.message)
    }
  }

  const recallHeld = async (order: Order): Promise<void> => {
    const lines: CartLine[] = order.lines.map((l) => ({
      lineId: `line-${crypto.randomUUID()}`,
      productId: l.productId,
      variantId: l.variantId,
      sku: l.sku,
      name: l.name,
      unitPrice: l.unitPrice,
      quantityMilli: l.quantity,
      isWeighted: l.quantity % 1000 !== 0,
      unitCode: 'pc',
      discountMinor: l.lineDiscount,
      notes: l.notes,
      taxBps: l.taxBps
    }))
    // Recall must succeed server-side before the cart is repopulated —
    // otherwise the cashier would edit an order the server still holds.
    const res = await window.api.orders.recall(order.id)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    loadFromOrder(order.id, lines)
    setHeldOrderId(order.id)
    void refreshHeld()
  }

  const applyDiscount = (): void => {
    if (discountMode === 'percent') {
      const pct = Number(discountValue)
      if (pct >= 0 && pct <= 100) {
        setCartDiscount({ kind: 'percent', value: Math.round(pct * 100) })
      }
    } else {
      const amt = Math.round(Number(discountValue) * 100)
      if (amt >= 0) setCartDiscount({ kind: 'amount', value: amt })
    }
    setDiscountOpen(false)
    setDiscountValue('10')
  }

  return (
    <div className="flex h-full">
      {/* Left: catalog */}
      <div className="flex flex-1 flex-col border-r border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-1)] p-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-2)]"
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Keyboard operation: Enter in the search field adds the first
                // (best) match — the cashier never needs the mouse.
                if (e.key === 'Enter' && products.length > 0) {
                  e.preventDefault()
                  addByProduct(products[0]!)
                  setSearch('')
                }
              }}
              placeholder="Search products by name, SKU, or scan barcode"
              aria-label="Search products"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-0)] py-2.5 pl-9 pr-10 text-sm outline-none placeholder:text-[var(--color-text-2)] focus:border-[var(--color-accent)]"
            />
            <Scan
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-accent)]"
            />
          </div>
          {/* Hidden barcode trap with label */}
          <input
            ref={barcodeRef}
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            placeholder="barcode"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {error}
            </div>
          )}
          {products.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[var(--color-text-2)]">
              No products match.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addByProduct(p)}
                  disabled={p.trackStock && p.stockOnHand <= 0 && !p.isWeighted}
                  className="flex flex-col items-start rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-3 text-left transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-2)] disabled:opacity-40"
                >
                  <span className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</span>
                  <span className="nums mt-2 text-base font-semibold text-[var(--color-accent)]">
                    {FMT(p.price)}
                    {p.isWeighted && <span className="text-xs font-normal">/kg</span>}
                  </span>
                  <span className="mt-1 text-xs text-[var(--color-text-2)]">
                    {p.trackStock
                      ? `${qty.format(p.stockOnHand)} ${p.isWeighted ? 'kg' : p.unitCode} in stock`
                      : 'Made to order'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: cart */}
      <div className="flex w-[420px] flex-col bg-[var(--color-bg-1)]">
        {/* Cart header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-[var(--color-text-1)]" />
            <h2 className="text-sm font-semibold">Current Sale</h2>
            {tableBanner && (
              <p className="mt-0.5 text-xs text-[var(--color-accent)]" role="status">
                {tableBanner}
              </p>
            )}
            {lines.length > 0 && (
              <span className="rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                {lines.length} item{lines.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDiscountOpen(true)}
              disabled={lines.length === 0}
              title="Discount"
            >
              <Percent size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHoldOpen(true)}
              disabled={lines.length === 0}
              title="Hold order"
            >
              <Pause size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={lines.length === 0}
              title="Clear cart"
              aria-label="Clear cart"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-[var(--color-text-2)]">
              <ShoppingBag size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="mt-1 text-xs">Scan a barcode or click a product</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {lines.map((l) => (
                <CartLineRow
                  key={l.lineId}
                  line={l}
                  onUpdate={setQuantity}
                  onRemove={removeLine}
                  onDiscount={setLineDiscount}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Totals + pay */}
        {lines.length > 0 && (
          <div className="border-t border-[var(--color-border)] p-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[var(--color-text-1)]">
                <span>Subtotal</span>
                <span className="nums">{FMT(totals.subtotal)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-[var(--color-success)]">
                  <span>Discount</span>
                  <span className="nums">-{FMT(totals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--color-text-1)]">
                <span>Tax</span>
                <span className="nums">{FMT(totals.taxTotal)}</span>
              </div>
              <div className="my-2 border-t border-[var(--color-border)] pt-2">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="nums text-[var(--color-accent)]">{FMT(totals.total)}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onPay('cash')}
                className="flex-col gap-0 py-3"
              >
                <span className="text-xs font-normal opacity-80">Cash</span>
                <span className="text-base font-bold">F9</span>
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onPay('card')}
                className="flex-col gap-0 py-3"
              >
                <span className="text-xs font-normal opacity-80">Card</span>
                <span className="text-base font-bold">F10</span>
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onPay('mobile_wallet')}
                className="flex-col gap-0 py-3"
              >
                <span className="text-xs font-normal opacity-80">Wallet</span>
                <span className="text-base font-bold">F11</span>
              </Button>
            </div>
            <Button
              variant="primary"
              size="xl"
              className="mt-2 w-full"
              onClick={() => void onPay('cash')}
            >
              Charge {FMT(totals.total)}
            </Button>
          </div>
        )}

        {/* Held orders */}
        {heldOrders.length > 0 && (
          <div className="border-t border-[var(--color-border)]">
            <div className="px-4 py-2 text-xs font-medium text-[var(--color-text-2)]">
              Held orders ({heldOrders.length})
            </div>
            {heldOrders.slice(0, 4).map((o) => (
              <button
                key={o.id}
                onClick={() => void recallHeld(o)}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-[var(--color-bg-2)]"
              >
                <span>{o.holdName ?? o.numberLabel}</span>
                <span className="nums text-[var(--color-text-2)]">{FMT(o.total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Discount modal */}
      <Modal open={discountOpen} onOpenChange={setDiscountOpen} title="Apply cart discount">
        <div className="flex gap-3">
          <select
            value={discountMode}
            onChange={(e) => setDiscountMode(e.target.value as 'percent' | 'amount')}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-sm text-[var(--color-text-0)]"
            aria-label="Discount type"
          >
            <option value="percent">Percent</option>
            <option value="amount">Fixed amount</option>
          </select>
          <input
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="nums w-32 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-sm text-[var(--color-text-0)]"
            aria-label="Discount value"
            min="0"
          />
          <Button onClick={applyDiscount}>Apply</Button>
        </div>
      </Modal>

      {/* Hold modal */}
      <Modal open={holdOpen} onOpenChange={setHoldOpen} title="Hold this order">
        <div className="space-y-3">
          <input
            value={holdName}
            onChange={(e) => setHoldName(e.target.value)}
            placeholder="Hold name (e.g. 'Ali — waiting')"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-sm text-[var(--color-text-0)]"
            aria-label="Hold name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onHold()}>Hold</Button>
          </div>
        </div>
      </Modal>

      {/* Receipt modal */}
      {lastOrder && (
        <Modal open={payOpen} onOpenChange={setPayOpen} title="Payment complete">
          <Receipt order={lastOrder} onClose={() => setPayOpen(false)} />
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function CartLineRow({
  line,
  onUpdate,
  onRemove,
  onDiscount
}: {
  line: CartLine
  onUpdate: (lineId: string, qtyMilli: number) => void
  onRemove: (lineId: string) => void
  onDiscount: (lineId: string, discountMinor: number) => void
}): React.ReactElement {
  void onDiscount
  const lineTotal =
    Math.round(((line.unitPrice * line.quantityMilli) / 1000 - line.discountMinor) * 1) / 1
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="text-xs text-[var(--color-text-2)]">
          {line.sku} · {FMT(line.unitPrice)}
          {line.isWeighted ? '/kg' : ''}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdate(line.lineId, Math.max(1000, line.quantityMilli - 1000))}
          disabled={line.quantityMilli <= 1000}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-2)] disabled:opacity-40"
          aria-label={`Decrease quantity of ${line.name}`}
        >
          −
        </button>
        <span className="nums w-14 text-center text-sm font-medium">
          {qty.format(line.quantityMilli)}
        </span>
        <button
          onClick={() => onUpdate(line.lineId, line.quantityMilli + 1000)}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-2)]"
          aria-label={`Increase quantity of ${line.name}`}
        >
          +
        </button>
      </div>

      <span className="nums w-20 text-right text-sm font-semibold">{FMT(lineTotal)}</span>
      <button
        onClick={() => onRemove(line.lineId)}
        aria-label={`Remove ${line.name}`}
        className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-2)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}

function Receipt({ order, onClose }: { order: Order; onClose: () => void }): React.ReactElement {
  return (
    <div>
      <div className="rounded-[var(--radius-md)] bg-white p-4 font-mono text-xs text-black">
        <div className="text-center">
          <div className="text-base font-bold">APEXPOS DEMO STORE</div>
          <div className="text-xs">Plot 14, Clifton Block 5, Karachi</div>
          <div className="mt-2 border-t border-black/20" />
        </div>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="font-normal">Item</th>
              <th className="text-right font-normal">Qty</th>
              <th className="text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td className="text-right">{qty.format(l.quantity)}</td>
                <td className="text-right">{FMT(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 border-t border-black/20 pt-2 text-right">
          <div>Subtotal: {FMT(order.subtotal)}</div>
          {order.discountTotal > 0 && <div>Discount: -{FMT(order.discountTotal)}</div>}
          <div>Tax: {FMT(order.taxTotal)}</div>
          <div className="mt-1 text-base font-bold">TOTAL: {FMT(order.total)}</div>
          {order.changeGiven > 0 && <div>Change: {FMT(order.changeGiven)}</div>}
        </div>
        <div className="mt-3 text-center text-[10px]">
          <div>{order.numberLabel}</div>
          <div>{new Date(order.createdAt).toLocaleString()}</div>
          <div>{order.userName}</div>
          <div className="mt-1">— Thank you for shopping with us —</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
          Print
        </Button>
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

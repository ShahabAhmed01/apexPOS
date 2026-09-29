import { useState, useEffect, useRef, useCallback } from 'react'
import { ShoppingCart, Trash2, Pause, Percent, Search, Scan, ShoppingBag } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../design-system/Button'
import { Badge } from '../../design-system/Badge'
import { Modal } from '../../design-system/Modal'
import { useCartStore, type CartLine } from './cartStore'
import { computeTotals } from './computeTotals'
import { qty } from '@shared/lib/quantity'
import type { Product, Order } from '@shared/types/models'
import { useQueryClient, useQuery } from '@tanstack/react-query'

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
  const [payOpen, setPayOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdName, setHoldName] = useState('')
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent')
  const [discountValue, setDiscountValue] = useState('10')
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heldOrderId, setHeldOrderId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const isProcessingRef = useRef(false)
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

  /** The draft payload every order write (pay / hold / fire) shares. */
  const buildOrderInput = (opId: string) => ({
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
    cartDiscount: cartDiscount ? { kind: cartDiscount.kind, value: cartDiscount.value } : undefined
  })

  /**
   * LT-008: persist the table's lines and fire them to the kitchen.
   * The KDS board only shows orders in `sent_to_kitchen`, and nothing in the
   * product ever produced that state — the fire channel was declared but not
   * registered. This is the user-facing half of the fix.
   */
  const onSendToKitchen = async (): Promise<void> => {
    if (!heldOrderId || lines.length === 0 || isProcessingRef.current) return
    isProcessingRef.current = true
    setError(null)
    setIsProcessing(true)
    try {
      const save = await window.api.orders.updateDraft({
        ...buildOrderInput(crypto.randomUUID()),
        orderId: heldOrderId
      })
      if (!save.ok) {
        setError(save.error.message)
        return
      }
      const fire = await window.api.orders.fireCourse({ orderId: heldOrderId })
      if (!fire.ok) {
        setError(fire.error.message)
        return
      }
      setTableBanner(`Sent to kitchen — table order ${save.data.numberLabel}`)
      void queryClient.invalidateQueries()
    } finally {
      setIsProcessing(false)
      isProcessingRef.current = false
    }
  }

  const onPay = async (
    method: 'cash' | 'card' | 'mobile_wallet',
    tendered?: number
  ): Promise<void> => {
    if (lines.length === 0 || isProcessingRef.current) return
    isProcessingRef.current = true
    setError(null)
    setIsProcessing(true)
    try {
      const opId = crypto.randomUUID()
      const base = buildOrderInput(opId)

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
    } finally {
      setIsProcessing(false)
      isProcessingRef.current = false
    }
  }

  const onHold = async (): Promise<void> => {
    if (lines.length === 0 || isProcessingRef.current) return
    isProcessingRef.current = true
    setError(null)
    setIsProcessing(true)
    try {
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
    } finally {
      setIsProcessing(false)
      isProcessingRef.current = false
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
      <div className="flex min-w-0 flex-1 flex-col border-e border-[var(--color-border)] bg-[var(--color-bg-0)]">
        <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-1)] p-3">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-2)]"
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const term = search.trim()
                  if (term) {
                    // Heuristic: if term looks like a barcode (all digits, 8+ chars), use byBarcode
                    const looksLikeBarcode = /^\d{8,}$/.test(term)
                    if (looksLikeBarcode) {
                      const barcodeRes = await window.api.products.byBarcode(term)
                      if (barcodeRes.ok && barcodeRes.data) {
                        addByProduct(barcodeRes.data)
                        setSearch('')
                        return
                      }
                      // Unknown barcode: show error
                      setError(`Barcode not found: ${term}`)
                      setTimeout(() => setError(null), 3000)
                      setSearch('')
                      return
                    }
                    // Search term: add first result (keyboard cashier workflow)
                    if (products.length > 0) {
                      addByProduct(products[0]!)
                      setSearch('')
                    }
                  }
                }
              }}
              placeholder="Search products by name, SKU, or scan barcode"
              aria-label="Search products"
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-0)] ps-9 pe-16 text-sm text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-2)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
            />
            <span className="absolute end-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              <span className="kbd" aria-hidden>
                F2
              </span>
              <Scan size={15} className="text-[var(--color-text-2)]" aria-hidden />
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && (
            <div
              role="alert"
              className="mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {error}
            </div>
          )}
          {products.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Search
                size={28}
                className="mb-2 text-[var(--color-text-2)] opacity-40"
                aria-hidden
              />
              <p className="text-sm font-medium text-[var(--color-text-1)]">No products match.</p>
              <p className="mt-1 text-xs text-[var(--color-text-2)]">
                Try a different name, SKU, or scan a barcode.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addByProduct(p)}
                  disabled={p.trackStock && p.stockOnHand <= 0 && !p.isWeighted}
                  className="group flex flex-col items-start rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-3 text-start transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-2)] active:border-[var(--color-accent-pressed)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--color-border)] disabled:hover:bg-[var(--color-bg-1)]"
                >
                  <span className="line-clamp-2 min-h-8 text-sm font-medium leading-tight text-[var(--color-text-0)]">
                    {p.name}
                  </span>
                  <span className="nums mt-2 text-base font-semibold text-[var(--color-text-0)]">
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
      <aside className="flex w-[420px] shrink-0 flex-col border-s border-[var(--color-border)] bg-[var(--color-bg-1)]">
        {/* Cart header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <ShoppingCart size={16} className="shrink-0 text-[var(--color-text-2)]" aria-hidden />
            <h2 className="shrink-0 text-sm font-semibold">Current Sale</h2>
            {lines.length > 0 && (
              <Badge tone="accent" className="shrink-0 px-2 py-0">
                {lines.length} item{lines.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDiscountOpen(true)}
              disabled={lines.length === 0}
              title="Discount"
              aria-label="Discount"
              className="h-8 w-8 px-0"
            >
              <Percent size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHoldOpen(true)}
              disabled={lines.length === 0}
              title="Hold order"
              aria-label="Hold order"
              className="h-8 w-8 px-0"
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
              className="h-8 w-8 px-0 hover:text-[var(--color-danger)]"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        {/* Table banner (dine-in handoff) */}
        {tableBanner && (
          <p
            className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-accent-subtle)] px-4 py-2 text-xs font-medium text-[var(--color-accent)]"
            role="status"
          >
            {tableBanner}
          </p>
        )}

        {/* Lines */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <ShoppingBag
                size={28}
                className="mb-2 text-[var(--color-text-2)] opacity-40"
                aria-hidden
              />
              <p className="text-sm font-medium text-[var(--color-text-1)]">Cart is empty</p>
              <p className="mt-1 text-xs text-[var(--color-text-2)]">
                Scan a barcode or click a product
              </p>
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
          <div className="shrink-0 border-t border-[var(--color-border)] p-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[var(--color-text-1)]">
                <span>Subtotal</span>
                <span className="nums">{FMT(totals.subtotal)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between font-medium text-[var(--color-success)]">
                  <span>Discount</span>
                  <span className="nums">-{FMT(totals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--color-text-1)]">
                <span>Tax</span>
                <span className="nums">{FMT(totals.taxTotal)}</span>
              </div>
            </div>

            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-base font-semibold">Total</span>
                <span className="nums text-2xl font-bold tracking-tight">{FMT(totals.total)}</span>
              </div>
            </div>

            {tableBanner && heldOrderId && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onSendToKitchen()}
                loading={isProcessing}
                disabled={lines.length === 0}
                className="mt-3 w-full"
              >
                Send to kitchen
              </Button>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onPay('cash')}
                loading={isProcessing}
                className="flex-col gap-0 py-2"
              >
                <span className="text-xs font-medium text-[var(--color-text-1)]">Cash</span>
                <span className="text-xs font-semibold tracking-wide text-[var(--color-text-2)]">
                  F9
                </span>
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onPay('card')}
                loading={isProcessing}
                className="flex-col gap-0 py-2"
              >
                <span className="text-xs font-medium text-[var(--color-text-1)]">Card</span>
                <span className="text-xs font-semibold tracking-wide text-[var(--color-text-2)]">
                  F10
                </span>
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void onPay('mobile_wallet')}
                loading={isProcessing}
                className="flex-col gap-0 py-2"
              >
                <span className="text-xs font-medium text-[var(--color-text-1)]">Wallet</span>
                <span className="text-xs font-semibold tracking-wide text-[var(--color-text-2)]">
                  F11
                </span>
              </Button>
            </div>
            <Button
              variant="primary"
              size="xl"
              className="mt-2 w-full"
              onClick={() => void onPay('cash')}
              loading={isProcessing}
            >
              Charge {FMT(totals.total)}
            </Button>
          </div>
        )}

        {/* Held orders */}
        {heldOrders.length > 0 && (
          <div className="shrink-0 border-t border-[var(--color-border)]">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-2)]">
              Held orders ({heldOrders.length})
            </div>
            {heldOrders.slice(0, 4).map((o) => (
              <button
                key={o.id}
                onClick={() => void recallHeld(o)}
                className="flex w-full items-center justify-between px-4 py-2 text-start text-sm transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-2)]"
              >
                <span className="min-w-0 truncate font-medium">{o.holdName ?? o.numberLabel}</span>
                <span className="nums shrink-0 ps-3 text-[var(--color-text-2)]">
                  {FMT(o.total)}
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* Discount modal */}
      <Modal open={discountOpen} onOpenChange={setDiscountOpen} title="Apply cart discount">
        <div className="flex gap-3">
          <select
            value={discountMode}
            onChange={(e) => setDiscountMode(e.target.value as 'percent' | 'amount')}
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 text-sm text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
            aria-label="Discount type"
          >
            <option value="percent">Percent</option>
            <option value="amount">Fixed amount</option>
          </select>
          <input
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="nums h-9 w-32 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 text-sm text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
            aria-label="Discount value"
            min="0"
          />
          <Button onClick={applyDiscount}>Apply</Button>
        </div>
      </Modal>

      {/* Hold modal */}
      <Modal open={holdOpen} onOpenChange={setHoldOpen} title="Hold this order">
        <div className="space-y-4">
          <input
            value={holdName}
            onChange={(e) => setHoldName(e.target.value)}
            placeholder="Hold name (e.g. 'Ali — waiting')"
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 text-sm text-[var(--color-text-0)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-2)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
            aria-label="Hold name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHoldOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onHold()} loading={isProcessing}>
              Hold
            </Button>
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
    <li className="flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-2)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="nums mt-0.5 text-xs text-[var(--color-text-2)]">
          {line.sku} · {FMT(line.unitPrice)}
          {line.isWeighted ? '/kg' : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onUpdate(line.lineId, Math.max(1000, line.quantityMilli - 1000))}
          disabled={line.quantityMilli <= 1000}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] text-sm text-[var(--color-text-1)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-0)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Decrease quantity of ${line.name}`}
        >
          −
        </button>
        <span className="nums w-14 text-center text-sm font-medium">
          {qty.format(line.quantityMilli)}
        </span>
        <button
          onClick={() => onUpdate(line.lineId, line.quantityMilli + 1000)}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-1)] text-sm text-[var(--color-text-1)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-0)]"
          aria-label={`Increase quantity of ${line.name}`}
        >
          +
        </button>
      </div>

      <span className="nums w-20 shrink-0 text-end text-sm font-semibold">{FMT(lineTotal)}</span>
      <button
        onClick={() => onRemove(line.lineId)}
        aria-label={`Remove ${line.name}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-2)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}

function Receipt({ order, onClose }: { order: Order; onClose: () => void }): React.ReactElement {
  // Business identity comes from Settings (app.business) — never hardcoded.
  const { data: business } = useQuery({
    queryKey: ['settings', 'app.business'],
    queryFn: async () => {
      const res = await window.api.settings.get('app.business')
      return res.ok
        ? (res.data as { name?: string; address?: string; phone?: string })
        : { name: undefined, address: undefined, phone: undefined }
    },
    staleTime: 60_000
  })
  return (
    <div>
      <div className="rounded-[var(--radius-md)] border border-black/10 bg-white p-4 font-mono text-xs text-black shadow-[var(--shadow-raised)]">
        <div className="text-center">
          <div className="text-base font-bold">{(business?.name || 'APEXPOS').toUpperCase()}</div>
          {business?.address ? <div className="text-xs">{business.address}</div> : null}
          {business?.phone ? <div className="text-xs">Ph: {business.phone}</div> : null}
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

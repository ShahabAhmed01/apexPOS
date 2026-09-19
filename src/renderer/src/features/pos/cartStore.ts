import { create } from 'zustand'
import type { Product, ProductVariant } from '@shared/types/models'
import type { Money } from '@shared/lib/money'

export interface CartLine {
  /** Stable client-side id for React keys and line edits */
  lineId: string
  productId: string
  variantId?: string
  sku: string
  name: string
  unitPrice: Money
  quantityMilli: number
  isWeighted: boolean
  unitCode: string
  discountMinor: Money
  notes?: string
  image?: string
  taxBps: number
}

export interface CartDiscount {
  kind: 'percent' | 'amount'
  /** percent: bps (1000 = 10%); amount: minor units */
  value: number
}

interface CartState {
  lines: CartLine[]
  cartDiscount: CartDiscount | null
  customerId?: string
  orderType: 'retail' | 'dine_in' | 'takeaway'
  heldOrderId?: string // when recalling a held order for editing

  addProduct: (p: Product, qtyMilli?: number, variant?: ProductVariant) => void
  removeLine: (lineId: string) => void
  setQuantity: (lineId: string, qtyMilli: number) => void
  setLineDiscount: (lineId: string, discountMinor: Money) => void
  setCartDiscount: (d: CartDiscount | null) => void
  setNotes: (lineId: string, notes: string) => void
  setCustomer: (id?: string) => void
  setOrderType: (t: 'retail' | 'dine_in' | 'takeaway') => void
  clear: () => void
  loadFromOrder: (orderId: string, lines: CartLine[]) => void
}

let lineSeq = 0
const nextLineId = (): string => `line-${Date.now()}-${++lineSeq}`

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  cartDiscount: null,
  orderType: 'retail',

  addProduct: (p, qtyMilli = 1000, variant) => {
    const price = variant?.price ?? p.price
    const name = variant ? `${p.name} — ${variant.name}` : p.name
    const existing = get().lines.find(
      (l) => l.productId === p.id && l.variantId === variant?.id && !l.notes
    )
    if (existing) {
      set({
        lines: get().lines.map((l) =>
          l.lineId === existing.lineId ? { ...l, quantityMilli: l.quantityMilli + qtyMilli } : l
        )
      })
      return
    }
    set({
      lines: [
        ...get().lines,
        {
          lineId: nextLineId(),
          productId: p.id,
          variantId: variant?.id,
          sku: variant?.sku ?? p.sku,
          name,
          unitPrice: price,
          quantityMilli: qtyMilli,
          isWeighted: p.isWeighted,
          unitCode: p.unitCode,
          discountMinor: 0,
          taxBps: p.taxBps
        }
      ]
    })
  },

  removeLine: (lineId) => set({ lines: get().lines.filter((l) => l.lineId !== lineId) }),

  setQuantity: (lineId, qtyMilli) => {
    if (qtyMilli <= 0) return
    set({
      lines: get().lines.map((l) => (l.lineId === lineId ? { ...l, quantityMilli: qtyMilli } : l))
    })
  },

  setLineDiscount: (lineId, discountMinor) =>
    set({
      lines: get().lines.map((l) => (l.lineId === lineId ? { ...l, discountMinor } : l))
    }),

  setCartDiscount: (d) => set({ cartDiscount: d }),
  setNotes: (lineId, notes) =>
    set({ lines: get().lines.map((l) => (l.lineId === lineId ? { ...l, notes } : l)) }),
  setCustomer: (id) => set({ customerId: id }),
  setOrderType: (t) => set({ orderType: t }),

  clear: () =>
    set({ lines: [], cartDiscount: null, customerId: undefined, heldOrderId: undefined }),

  loadFromOrder: (orderId, lines) => set({ heldOrderId: orderId, lines })
}))

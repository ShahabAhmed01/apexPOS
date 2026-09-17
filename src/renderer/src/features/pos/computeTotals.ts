import type { CartLine } from './cartStore'

/** Client-side preview totals. Server recomputes authoritatively on submit. */
export function computeTotals(lines: CartLine[], cartDiscount: { kind: string; value: number } | null) {
  const subtotalSum = lines.reduce(
    (acc, l) => acc + Math.round((l.unitPrice * l.quantityMilli) / 1000),
    0
  )
  const lineDiscounts = lines.reduce((a, l) => a + l.discountMinor, 0)
  const afterLine = subtotalSum - lineDiscounts
  const cartDiscountMinor =
    cartDiscount?.kind === 'percent'
      ? Math.round((afterLine * cartDiscount.value) / 10000)
      : (cartDiscount?.value ?? 0)
  const net = Math.max(0, afterLine - cartDiscountMinor)
  const tax = Math.round((net * 1800) / 10000) // fixed 18% for UI preview; server recomputes
  return {
    subtotal: subtotalSum,
    discountTotal: lineDiscounts + cartDiscountMinor,
    taxTotal: tax,
    total: net + tax
  }
}


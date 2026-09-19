import type { CartLine } from './cartStore'
import { priceOrder, type PricingLine, type CartDiscount } from '@shared/lib/pricing'

/**
 * Client-side preview totals. Uses the exact same pure pricing engine the
 * server runs authoritatively on submit (@shared/lib/pricing), so the preview
 * cannot diverge from what will be charged. Per-line tax comes from the
 * product's configured rate — never a hardcoded constant.
 */
export function computeTotals(
  lines: CartLine[],
  cartDiscount: { kind: 'percent' | 'amount'; value: number } | null
): { subtotal: number; discountTotal: number; taxTotal: number; total: number } {
  const pricingLines: PricingLine[] = lines.map((l) => ({
    quantityMilli: l.quantityMilli,
    unitPrice: l.unitPrice,
    modifiersPerUnit: 0,
    discountAmount: Math.min(l.discountMinor, Math.round((l.unitPrice * l.quantityMilli) / 1000)),
    taxBps: l.taxBps
  }))
  const discount: CartDiscount =
    cartDiscount?.kind === 'percent'
      ? { kind: 'percent', value: cartDiscount.value }
      : cartDiscount
        ? { kind: 'amount', value: cartDiscount.value }
        : null
  const { totals } = priceOrder(pricingLines, discount)
  return {
    subtotal: totals.subtotal,
    discountTotal: totals.lineDiscountTotal + totals.cartDiscount,
    taxTotal: totals.taxTotal,
    total: totals.total
  }
}

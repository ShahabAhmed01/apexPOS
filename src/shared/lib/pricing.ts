import { bpsOf, mul, sub, add, sum, splitEvenly, roundHalfAwayFromZero, type Money } from './money'
import { qty } from './quantity'
import { AppError, ErrorCode } from './errors'

/**
 * Order pricing engine — pure functions. Every calculation is integer-based
 * and deterministic. Tested to 100% branch coverage (tests/unit/pricing.test.ts).
 */

export interface PricingLine {
  quantityMilli: number
  unitPrice: Money
  /** Sum of all modifier price deltas for one unit. */
  modifiersPerUnit: Money
  /** Line-level discount (percent bps or fixed amount resolved beforehand). */
  discountAmount: Money
  taxBps: number
}

export interface PricedLine {
  gross: Money
  discount: Money
  net: Money
  tax: Money
  lineTotal: Money
}

/** Price one line: qty × (unitPrice + modifiers) − discount, then tax. */
export const priceLine = (line: PricingLine): PricedLine => {
  if (line.discountAmount < 0) {
    throw new AppError(ErrorCode.Validation, 'Line discount may not be negative.')
  }
  if (!Number.isInteger(line.taxBps) || line.taxBps < 0 || line.taxBps > 10_000) {
    throw new AppError(ErrorCode.Validation, `Tax rate out of range: ${line.taxBps}`)
  }
  const unitTotal = line.unitPrice + line.modifiersPerUnit
  const qtyFactor = line.quantityMilli / 1000
  const gross = mul(unitTotal, qtyFactor)
  const discount = Math.min(line.discountAmount, gross)
  const net = sub(gross, discount)
  const tax = bpsOf(net, line.taxBps)
  return { gross, discount, net, tax, lineTotal: add(net, tax) }
}

export type CartDiscount = { kind: 'percent' | 'amount'; value: number } | null

export interface OrderTotals {
  subtotal: Money
  lineDiscountTotal: Money
  cartDiscount: Money
  taxTotal: Money
  serviceCharge: Money
  tip: Money
  total: Money
}

/**
 * Compute order totals. Cart discounts are allocated to lines pro-rata so tax
 * stays legal when different lines carry different tax rates.
 */
export const priceOrder = (
  lines: PricingLine[],
  cartDiscount: CartDiscount,
  opts: { serviceCharge?: Money; tip?: Money } = {}
): { lines: PricedLine[]; totals: OrderTotals } => {
  // Domain guards — the pricing engine may never emit negative or
  // over-discounted totals, no matter which layer called it.
  for (const l of lines) {
    if (Number.isInteger(l.quantityMilli) === false || l.quantityMilli <= 0) {
      throw new AppError(ErrorCode.Validation, 'Line quantity must be a positive integer.')
    }
    if (!Number.isInteger(l.taxBps) || l.taxBps < 0 || l.taxBps > 10_000) {
      throw new AppError(ErrorCode.Validation, `Tax rate out of range: ${l.taxBps}`)
    }
    if (l.discountAmount < 0) {
      throw new AppError(ErrorCode.Validation, 'Line discount may not be negative.')
    }
  }
  if (cartDiscount) {
    if (cartDiscount.kind === 'percent') {
      if (
        !Number.isInteger(cartDiscount.value) ||
        cartDiscount.value < 0 ||
        cartDiscount.value > 10_000
      ) {
        throw new AppError(
          ErrorCode.Validation,
          'Cart percent discount must be a whole number between 0% and 100%.'
        )
      }
    } else if (!Number.isInteger(cartDiscount.value) || cartDiscount.value < 0) {
      throw new AppError(
        ErrorCode.Validation,
        'Cart discount amount must be a non-negative integer.'
      )
    }
  }
  for (const [label, v] of [
    ['service charge', opts.serviceCharge],
    ['tip', opts.tip]
  ] as const) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
      throw new AppError(ErrorCode.Validation, `${label} must be a non-negative integer.`)
    }
  }

  const priced = lines.map(priceLine)
  const subtotal = sum(priced.map((p) => p.gross))
  const lineDiscountTotal = sum(priced.map((p) => p.discount))

  // Cart discount: resolve to an absolute minor amount
  const afterLine = sum(priced.map((p) => p.net))
  let cartDiscountMinor = 0
  if (cartDiscount) {
    cartDiscountMinor =
      cartDiscount.kind === 'percent'
        ? bpsOf(afterLine, cartDiscount.value)
        : Math.min(cartDiscount.value, afterLine)
  }

  // Allocate cart discount across lines by net value; re-price tax per line.
  let finalLines = priced
  if (cartDiscountMinor > 0 && afterLine > 0) {
    const weights = priced.map((p) => p.net)
    const shares = splitProportionally(cartDiscountMinor, weights)
    finalLines = priced.map((p, i) => {
      const withShare = p.net - (shares[i] ?? 0)
      const tax = bpsOf(withShare, lines[i]!.taxBps)
      return { ...p, net: withShare, tax, lineTotal: add(withShare, tax) }
    })
  }

  const taxTotal = sum(finalLines.map((p) => p.tax))
  const discountedNet = sum(finalLines.map((p) => p.net))
  const total = add(discountedNet, taxTotal, opts.serviceCharge ?? 0, opts.tip ?? 0)

  return {
    lines: finalLines,
    totals: {
      subtotal,
      lineDiscountTotal,
      cartDiscount: cartDiscountMinor,
      taxTotal,
      serviceCharge: opts.serviceCharge ?? 0,
      tip: opts.tip ?? 0,
      total
    }
  }
}

const splitProportionally = (total: Money, weights: Money[]): Money[] => {
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum === 0) return weights.map(() => 0)
  // Largest-remainder via floor + redistribute; deterministic.
  const exact = weights.map((w) => (total * w) / weightSum)
  const floors = exact.map((v) => Math.floor(v))
  let remainder = total - sum(floors)
  const order = weights
    .map((_, i) => i)
    .sort(
      (a, b) =>
        (exact[b] ?? 0) - Math.floor(exact[b] ?? 0) - ((exact[a] ?? 0) - Math.floor(exact[a] ?? 0))
    )
  const result = [...floors]
  for (const i of order) {
    if (remainder <= 0) break
    result[i] = (result[i] ?? 0) + 1
    remainder -= 1
  }
  return result
}

/**
 * Cash change: tendered minus total. Returns negative if under-tendered
 * (caller validates).
 */
export const changeDue = (total: Money, tendered: Money): Money => sub(tendered, total)

/**
 * Split an order total across N payments (for even split-bill). Sums to total.
 */
export const splitBill = (total: Money, parts: number): Money[] => splitEvenly(total, parts)

/**
 * Round a total to a cash denomination (e.g. nearest 500 minor units for
 * cash-only markets). Half away from zero.
 */
export const cashRound = (amount: Money, nearestMinor: number): Money =>
  nearestMinor <= 1 ? amount : roundHalfAwayFromZero(amount / nearestMinor) * nearestMinor

export const qtyFor = (m: { isWeighted: boolean }, requestedMilli: number): number => {
  // Whole units for non-weighted items
  if (!m.isWeighted && requestedMilli % 1000 !== 0) {
    return Math.floor(requestedMilli / 1000) * 1000
  }
  return requestedMilli
}

export { qty }

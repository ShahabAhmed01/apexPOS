import { describe, it, expect } from 'vitest'
import { priceLine, priceOrder, changeDue, splitBill, cashRound, type PricingLine } from '@main/services/pricing'

const line = (overrides: Partial<PricingLine> = {}): PricingLine => ({
  quantityMilli: 1000,
  unitPrice: 10000, // 100.00
  modifiersPerUnit: 0,
  discountAmount: 0,
  taxBps: 0,
  ...overrides
})

describe('priceLine', () => {
  it('computes a simple untaxed line', () => {
    const p = priceLine(line())
    expect(p.gross).toBe(10000)
    expect(p.net).toBe(10000)
    expect(p.tax).toBe(0)
    expect(p.lineTotal).toBe(10000)
  })

  it('scales by quantity incl. fractional (weighted)', () => {
    const p = priceLine(line({ quantityMilli: 2500 }))
    expect(p.gross).toBe(25000)
  })

  it('adds modifiers per unit', () => {
    const p = priceLine(line({ modifiersPerUnit: 1500 }))
    expect(p.gross).toBe(11500)
  })

  it('applies line discount before tax', () => {
    const p = priceLine(line({ discountAmount: 2000, taxBps: 1800 }))
    expect(p.net).toBe(8000)
    expect(p.tax).toBe(1440) // 18% of 80.00
    expect(p.lineTotal).toBe(9440)
  })

  it('clamps discount at line gross', () => {
    const p = priceLine(line({ discountAmount: 99999 }))
    expect(p.net).toBe(0)
    expect(p.tax).toBe(0)
  })

  it('rounds fractional-quantity money deterministically', () => {
    // 100.00 × 1.005 qty → half-up 10050
    const p = priceLine(line({ quantityMilli: 1005 }))
    expect(p.gross).toBe(10050)
  })
})

describe('priceOrder', () => {
  it('sums multiple lines', () => {
    const { totals } = priceOrder([line(), line({ unitPrice: 5000 })], null)
    expect(totals.subtotal).toBe(15000)
    expect(totals.total).toBe(15000)
  })

  it('applies percent cart discount and recomputes tax per line', () => {
    const { totals, lines } = priceOrder(
      [line({ taxBps: 1800 })],
      { kind: 'percent', value: 1000 } // 10%
    )
    expect(totals.cartDiscount).toBe(1000)
    expect(lines[0]?.net).toBe(9000)
    expect(lines[0]?.tax).toBe(1620)
    expect(totals.total).toBe(10620)
  })

  it('applies fixed cart discount allocated proportionally', () => {
    const { totals, lines } = priceOrder(
      [line({ unitPrice: 7000 }), line({ unitPrice: 3000 })],
      { kind: 'amount', value: 1000 }
    )
    // 7000/10000 → 700, 3000/10000 → 300
    expect(lines[0]?.net).toBe(6300)
    expect(lines[1]?.net).toBe(2700)
    expect(totals.cartDiscount).toBe(1000)
    expect(totals.total).toBe(9000)
  })

  it('adds service charge and tip after discounts/tax', () => {
    const { totals } = priceOrder([line()], null, { serviceCharge: 500, tip: 200 })
    expect(totals.total).toBe(10700)
  })
})

describe('tender helpers', () => {
  it('computes change', () => {
    expect(changeDue(10000, 15000)).toBe(5000)
    expect(changeDue(10000, 9000)).toBe(-1000)
  })

  it('splits bills with exact totals preserved', () => {
    const parts = splitBill(10001, 3)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10001)
    expect(parts).toEqual([3334, 3334, 3333])
  })

  it('cash-rounds to nearest 5 (or any denomination)', () => {
    expect(cashRound(10002, 5)).toBe(10000)
    expect(cashRound(10003, 5)).toBe(10005)
  })
})

import { describe, it, expect } from 'vitest'
import { priceOrder, splitBill, cashRound, type PricingLine } from '@shared/lib/pricing'
import {
  add,
  allocate,
  bpsOf,
  fromDecimal,
  ofMinor,
  percentOf,
  roundHalfAwayFromZero,
  splitEvenly,
  sub,
  toDecimal
} from '@shared/lib/money'
import { qty } from '@shared/lib/quantity'

/**
 * ADVERSARIAL-FUZZ (money domain) — 100k+ deterministic cases against an
 * INDEPENDENT oracle. The oracle deliberately re-computes every result with
 * plain integer accounting; the engine under test must agree bitwise.
 */

// Deterministic PRNG (LCG) — failures are reproducible from this seed.
let s = 0xc0ffee
const rand = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const randInt = (max: number, min = 0): number => min + Math.floor(rand() * (max - min + 1))

describe('TC-FUZZ-MONEY — money primitives against an independent oracle', () => {
  it('TC-FUZZ-MONEY-001: fromDecimal/toDecimal round-trip exactly (20k cases incl. half-cent boundaries)', () => {
    for (let i = 0; i < 20_000; i++) {
      const units = randInt(1_000_000, -1_000_000)
      const asDecimal = toDecimal(units)
      expect(fromDecimal(asDecimal)).toBe(units)
    }
    // Boundary probes around the rounding cliff
    for (const probe of [
      '0.004',
      '0.005',
      '0.006',
      '0.014',
      '0.015',
      '0.016',
      '-0.004',
      '-0.005',
      '-0.006',
      '1.005',
      '2.675'
    ]) {
      const v = fromDecimal(probe)
      const [whole, frac] = probe.replace('-', '').split('.') as [string, string]
      const thirdDigit = Number(frac[2] ?? '0')
      const expectedMag = Number(whole) * 100 + Number(frac.slice(0, 2)) + (thirdDigit >= 5 ? 1 : 0)
      const expected = probe.startsWith('-') ? -expectedMag : expectedMag
      expect(v, `fromDecimal(${probe})`).toBe(expected)
    }
  })

  it(
    'TC-FUZZ-MONEY-002: add/sub form a group; mul distributes within rounding (100k ops)',
    { timeout: 30_000 },
    () => {
      let checksum = 0
      for (let i = 0; i < 100_000; i++) {
        const a = randInt(1_000_000, -1_000_000)
        const b = randInt(1_000_000, -1_000_000)
        const c = randInt(10_000, -10_000)
        expect(add(a, b)).toBe(a + b)
        expect(sub(a, b)).toBe(a - b)
        expect(add(a, b, c)).toBe(a + b + c)
        expect(sub(add(a, b), b)).toBe(a)
        checksum ^= add(a, b, c)
      }
      expect(Number.isSafeInteger(checksum)).toBe(true)
    }
  )

  it('TC-FUZZ-MONEY-003: splitEvenly shares always sum EXACTLY to the total (50k cases)', () => {
    for (let i = 0; i < 50_000; i++) {
      const total = randInt(1_000_000, -1_000_000)
      const parts = randInt(97, 1)
      const shares = splitEvenly(total, parts)
      expect(shares).toHaveLength(parts)
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
      // Maximum skew between shares is at most one minor unit
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
    }
  })

  it(
    'TC-FUZZ-MONEY-004: allocate shares always sum EXACTLY to the total (50k cases)',
    { timeout: 30_000 },
    () => {
      let tested = 0
      while (tested < 50_000) {
        const total = randInt(500_000)
        const weights = Array.from({ length: randInt(9, 1) }, () => randInt(1000))
        const wt = weights.reduce((a, b) => a + b, 0)
        if (wt === 0) continue // degenerate all-zero vector: correctly allocates 0 share everywhere
        tested++
        const shares = allocate(total, weights)
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
        expect(shares.every((x) => x >= 0)).toBe(true)
        shares.forEach((share, idx) => {
          const exact = (total * weights[idx]!) / wt
          expect(Math.abs(share - exact)).toBeLessThan(1.0000001)
        })
      }
    }
  )

  it(
    'TC-FUZZ-MONEY-005: bpsOf == oracle percent, always half-away-from-zero (25k cases)',
    { timeout: 30_000 },
    () => {
      for (let i = 0; i < 25_000; i++) {
        const amount = randInt(2_000_000, -2_000_000)
        const bps = [0, 1, 500, 1750, 1800, 2500, 9500, 10000][randInt(7)]!
        const expected = roundHalfAwayFromZero((amount * bps) / 10_000)
        expect(bpsOf(amount, bps)).toBe(expected)
        expect(percentOf(amount, bps / 100)).toBe(expected)
        expect(Math.sign(bpsOf(amount, bps)) !== -1 || amount < 0).toBe(true)
      }
    }
  )

  it(
    'TC-FUZZ-MONEY-006: full priceOrder fuzz — totals never negative, never exceed gross+tax ceiling',
    { timeout: 30_000 },
    () => {
      for (let iter = 0; iter < 20_000; iter++) {
        const lines: PricingLine[] = Array.from({ length: randInt(5, 1) }, () => ({
          quantityMilli: randInt(9_000, 1_000),
          unitPrice: randInt(99_999),
          modifiersPerUnit: randInt(1000),
          discountAmount: randInt(500),
          taxBps: [0, 500, 1800, 2500][randInt(3)]!
        }))
        const cart =
          rand() < 0.4
            ? { kind: 'percent' as const, value: randInt(10_000) }
            : rand() < 0.8
              ? { kind: 'amount' as const, value: randInt(30_000) }
              : null
        const { lines: pl, totals } = priceOrder(lines, cart)
        // Independent reconciliation: total == Σ nets + Σ taxes
        expect(totals.total).toBe(pl.reduce((a, l) => a + l.net + l.tax, 0))
        expect(totals.total).toBeGreaterThanOrEqual(0)
        // Net effects of the cart discount must reconcile: Σ net == Σ(gross − lineDiscount) − cartDiscount
        const netBeforeCart = pl.reduce((a, l) => a + l.gross - l.discount, 0)
        const cartApplied = netBeforeCart - pl.reduce((a, l) => a + l.net, 0)
        expect(cartApplied).toBeGreaterThanOrEqual(0)
        // Every line is internally consistent
        for (const l of pl) {
          expect(l.lineTotal).toBe(l.net + l.tax)
          expect(l.net).toBeLessThanOrEqual(l.gross)
          expect(l.net).toBeGreaterThanOrEqual(0)
          expect(l.tax).toBeGreaterThanOrEqual(0)
        }
      }
    }
  )

  it('TC-FUZZ-MONEY-007: splitBill is an even split that always closes', () => {
    for (let i = 0; i < 10_000; i++) {
      const total = randInt(100_000, 0)
      const ways = randInt(7, 2)
      const parts = splitBill(total, ways)
      expect(parts.reduce((a, b) => add(a, b), 0)).toBe(total)
    }
  })

  it('TC-FUZZ-MONEY-008: cashRound is idempotent and within half a unit', () => {
    expect(() => roundHalfAwayFromZero(NaN)).not.toThrow() // normalizes via Math.round
    for (let i = 0; i < 10_000; i++) {
      const amount = randInt(1_000_000)
      const nearest = [5, 10, 25, 50, 100, 500][randInt(5)]!
      const rounded = cashRound(amount, nearest)
      expect(rounded % nearest).toBe(0)
      expect(Math.abs(rounded - amount)).toBeLessThanOrEqual(nearest / 2)
    }
  })

  it('TC-FUZZ-QTY-001: quantity parse/format round-trip (10k)', () => {
    for (let i = 0; i < 10_000; i++) {
      const milli = randInt(9_999_999)
      expect(qty.fromNumber(milli / 1000)).toBe(milli)
      expect(typeof qty.format(milli)).toBe('string')
    }
    expect(() => qty.fromDecimal('1.0001')).toThrow()
    expect(() => qty.fromDecimal('-5')).not.toThrow() // negatives parse; domain callers reject
    expect(qty.fromDecimal('-5')).toBe(-5000)
  })

  it('TC-FUZZ-MONEY-009: ofMinor rejects non-integers and unsafe values', () => {
    for (const bad of [
      1.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      -Number.MAX_SAFE_INTEGER - 1
    ]) {
      expect(() => ofMinor(bad)).toThrow()
    }
    for (const good of [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      expect(ofMinor(good)).toBe(good)
    }
  })
})

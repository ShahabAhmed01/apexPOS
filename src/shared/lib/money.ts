/**
 * money.ts — the ONLY place monetary arithmetic happens.
 *
 * Invariants
 *  - Every monetary value is an INTEGER number of minor currency units
 *    (e.g. paisa/cents). PKR 1,250.50 is stored as 125050.
 *  - No floating-point value ever represents money. Fractional inputs are
 *    parsed from strings and rounded ONCE at the boundary.
 *  - Rounding policy: ROUND_HALF_AWAY_FROM_ZERO (commercial "half-up").
 *    Applied deterministically by every operation that can produce a
 *    fraction (multiply by factor, percent, division).
 *
 * Quantities (weight/count) are NOT money: they use integer thousandths
 * (qty milli-units) defined in `quantity.ts` to keep the same determinism.
 */

/** An integer number of minor currency units. */
export type Money = number

export const ZERO: Money = 0

/** Deterministic rounding, ties away from zero. Avoids `Math.round` asymmetry on negatives. */
export const roundHalfAwayFromZero = (x: number): number =>
  x < 0 ? -Math.round(-x) : Math.round(x)

const assertInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money invariant violated: ${label} must be a safe integer, got ${value}`)
  }
}

/** Construct from already-minor units. Throws if not an integer. */
export const ofMinor = (minor: number): Money => {
  assertInteger(minor, 'ofMinor')
  return minor
}

/**
 * Parse a decimal STRING ("1250.50", "-12.5") into minor units.
 * `fractionDigits` defaults to 2 (PKR/USD/EUR style).
 * If more fraction digits are provided than the currency supports, the value
 * is rounded half-away-from-zero exactly once.
 */
export const fromDecimal = (input: string, fractionDigits = 2): Money => {
  const trimmed = input.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: "${input}"`)
  }
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [intPart, fracPart = ''] = unsigned.split('.') as [string, string]
  const scale = 10 ** fractionDigits
  let fracMinor: number
  if (fracPart.length <= fractionDigits) {
    fracMinor = Number(fracPart.padEnd(fractionDigits, '0') || '0')
  } else {
    const kept = Number(fracPart.slice(0, fractionDigits) || '0')
    const firstDropped = Number(fracPart[fractionDigits] ?? '0')
    // Any extra digits can only push "exactly .5" upward — already covered by >= 5.
    fracMinor = firstDropped >= 5 ? kept + 1 : kept
  }
  const value = Number(intPart) * scale + fracMinor
  return negative ? -value : value
}

/** Format as fixed decimal string, e.g. 125050 → "1250.50". */
export const toDecimal = (amount: Money, fractionDigits = 2): string => {
  assertInteger(amount, 'toDecimal')
  const scale = 10 ** fractionDigits
  const negative = amount < 0
  const abs = Math.abs(amount)
  const intPart = Math.floor(abs / scale)
  const fracPart = abs % scale
  return `${negative ? '-' : ''}${intPart}.${String(fracPart).padStart(fractionDigits, '0')}`
}

/** Localized display, e.g. "₨ 1,250.50". Integer-backed; string math first. */
export const format = (
  amount: Money,
  opts: { currency: string; locale?: string; symbol?: 'standard' | 'narrow' }
): string => {
  const fractionDigits =
    new Intl.NumberFormat('en', { style: 'currency', currency: opts.currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  const value = amount / 10 ** fractionDigits
  return new Intl.NumberFormat(opts.locale ?? 'en', {
    style: 'currency',
    currency: opts.currency,
    currencyDisplay: opts.symbol === 'narrow' ? 'narrowSymbol' : 'symbol'
  }).format(value)
}

export const add = (...values: Money[]): Money => {
  let total = 0
  for (const v of values) {
    assertInteger(v, 'add')
    total += v
  }
  return total
}

export const sub = (a: Money, b: Money): Money => add(a, -b)

/** Multiply by an arbitrary factor (e.g. quantity 1.5). Rounds half-away-from-zero. */
export const mul = (amount: Money, factor: number): Money => {
  assertInteger(amount, 'mul')
  if (!Number.isFinite(factor)) throw new Error('mul factor must be finite')
  return roundHalfAwayFromZero(amount * factor)
}

/**
 * Percentage of an amount. `percent` is expressed in percent units,
 * e.g. 17.5 for 17.5%. Rounds half-away-from-zero.
 */
export const percentOf = (amount: Money, percent: number): Money => {
  assertInteger(amount, 'percentOf')
  if (!Number.isFinite(percent)) throw new Error('percent must be finite')
  return roundHalfAwayFromZero((amount * percent) / 100)
}

/**
 * Percentage using integer basis points (1% = 100 bps). Preferred for tax rates
 * stored in the database — no floats involved.
 */
export const bpsOf = (amount: Money, bps: number): Money => {
  assertInteger(amount, 'bpsOf')
  assertInteger(bps, 'bpsOf')
  return roundHalfAwayFromZero((amount * bps) / 10_000)
}

/**
 * Split a total into `parts` integer shares that sum EXACTLY to the total,
 * distributing the rounding remainder to the earliest shares.
 */
export const splitEvenly = (total: Money, parts: number): Money[] => {
  assertInteger(total, 'splitEvenly')
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new Error('splitEvenly: parts must be a positive integer')
  }
  const base = Math.trunc(total / parts)
  let remainder = total - base * parts
  const step = remainder > 0 ? 1 : -1
  const result: Money[] = []
  for (let i = 0; i < parts; i += 1) {
    if (remainder !== 0) {
      result.push(base + step)
      remainder -= step
    } else {
      result.push(base)
    }
  }
  return result
}

/**
 * Proportional allocation by integer weights. Shares sum exactly to total.
 * Largest-remainder method: deterministic and stable for a fixed input order.
 */
export const allocate = (total: Money, weights: readonly number[]): Money[] => {
  assertInteger(total, 'allocate')
  if (weights.length === 0) return []
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error('allocate weights must be non-negative integers')
  }
  const weightTotal = weights.reduce((a, b) => a + b, 0)
  if (weightTotal === 0) return weights.map(() => 0)

  const exact = weights.map((w) => (total * w) / weightTotal)
  const floors = exact.map((v) => Math.floor(v))
  let remainder = total - floors.reduce((a, b) => a + b, 0)
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      const fa = (exact[a] as number) - (floors[a] as number)
      const fb = (exact[b] as number) - (floors[b] as number)
      return fb - fa || a - b
    })
  const result = [...floors]
  for (const i of order) {
    if (remainder <= 0) break
    result[i] = (result[i] as number) + 1
    remainder -= 1
  }
  return result
}

export const clampNonNegative = (amount: Money): Money => Math.max(0, amount)
export const sum = (values: readonly Money[]): Money => values.reduce<number>((a, b) => a + b, 0)
export const abs = (a: Money): Money => Math.abs(a)
export const equals = (a: Money, b: Money): boolean => a === b
export const isZero = (a: Money): boolean => a === 0

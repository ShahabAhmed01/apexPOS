/**
 * quantity.ts — integer thousandths representation for product quantities.
 *
 * Rationale: weighted items (1.255 kg) must be deterministic in SUM() queries
 * and cross-branch reconciliations. Every qty column is an integer count of
 * 0.001 units. Precision of 3 decimals matches retail scale resolution.
 */

export type QtyMilli = number

export const QTY_PRECISION = 3

export const qty = {
  fromNumber(value: number): QtyMilli {
    if (!Number.isFinite(value)) throw new Error(`Invalid quantity: ${value}`)
    const milli = Math.round(value * 1000)
    if (!Number.isSafeInteger(milli)) throw new Error(`Quantity out of range: ${value}`)
    return milli
  },
  fromDecimal(input: string): QtyMilli {
    const trimmed = input.trim()
    if (!/^-?\d+(\.\d{1,3})?$/.test(trimmed)) {
      throw new Error(`Invalid quantity: "${input}"`)
    }
    return this.fromNumber(Number(trimmed))
  },
  toNumber(q: QtyMilli): number {
    return q / 1000
  },
  format(q: QtyMilli): string {
    const negative = q < 0
    const abs = Math.abs(q)
    const intPart = Math.floor(abs / 1000)
    const frac = String(abs % 1000)
      .padStart(3, '0')
      .replace(/0+$/, '')
    return `${negative ? '-' : ''}${intPart}${frac ? '.' + frac : ''}`
  },
  add(...values: QtyMilli[]): QtyMilli {
    return values.reduce((a, b) => a + b, 0)
  },
  isZero(q: QtyMilli): boolean {
    return q === 0
  }
}

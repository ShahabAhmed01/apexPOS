import { describe, it, expect } from 'vitest'
import { qty } from '@shared/lib/quantity'

describe('quantity', () => {
  it('converts to/from milli-units', () => {
    expect(qty.fromNumber(1.255)).toBe(1255)
    expect(qty.toNumber(1255)).toBe(1.255)
  })

  it('parses decimal strings with up to 3dp', () => {
    expect(qty.fromDecimal('1.5')).toBe(1500)
    expect(qty.fromDecimal('0.001')).toBe(1)
    expect(() => qty.fromDecimal('1.2345')).toThrow()
  })

  it('formats cleanly', () => {
    expect(qty.format(1500)).toBe('1.5')
    expect(qty.format(1000)).toBe('1')
    expect(qty.format(-2250)).toBe('-2.25')
  })
})

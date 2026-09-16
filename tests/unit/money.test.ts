import { describe, it, expect } from 'vitest'
import * as money from '@shared/lib/money'

describe('money.fromDecimal / toDecimal', () => {
  it('parses standard decimals', () => {
    expect(money.fromDecimal('1250.50')).toBe(125050)
    expect(money.fromDecimal('0.01')).toBe(1)
    expect(money.fromDecimal('100')).toBe(10000)
    expect(money.fromDecimal('-5.25')).toBe(-525)
  })

  it('rounds extra digits half-up', () => {
    expect(money.fromDecimal('1.005')).toBe(101) // half away from zero
    expect(money.fromDecimal('1.004')).toBe(100)
    expect(money.fromDecimal('1.006')).toBe(101)
    expect(money.fromDecimal('-1.005')).toBe(-101)
  })

  it('rejects garbage', () => {
    expect(() => money.fromDecimal('abc')).toThrow()
    expect(() => money.fromDecimal('1.2.3')).toThrow()
  })

  it('round-trips through toDecimal', () => {
    expect(money.toDecimal(money.fromDecimal('1250.50'))).toBe('1250.50')
    expect(money.toDecimal(-525)).toBe('-5.25')
    expect(money.toDecimal(0)).toBe('0.00')
  })
})

describe('money arithmetic', () => {
  it('add/sub are integer-exact', () => {
    expect(money.add(10050, 20025, 500)).toBe(30575)
    expect(money.sub(10000, 1)).toBe(9999)
  })

  it('mul rounds correctly', () => {
    expect(money.mul(1999, 1.5)).toBe(2999) // 2998.5 → 2999 half-up
    expect(money.mul(1000, 2)).toBe(2000)
  })

  it('bpsOf handles tax rates exactly', () => {
    expect(money.bpsOf(100000, 1800)).toBe(18000) // 18% of 1000.00 = 180.00
    expect(money.bpsOf(1050, 1700)).toBe(179) // 17% of 10.50 = 1.785 → 1.79
  })

  it('splitEvenly sums exactly to total', () => {
    const parts = money.splitEvenly(10000, 3)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000)
    expect(parts).toEqual([3334, 3333, 3333])
  })

  it('allocate sums exactly to total', () => {
    const parts = money.allocate(10000, [1, 2, 3])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000)
    expect(parts[0]).toBe(1667)
    expect(parts[1]).toBe(3333)
    expect(parts[2]).toBe(5000)
  })

  it('handles zero and empty allocations', () => {
    expect(money.allocate(5000, [0, 0, 0])).toEqual([0, 0, 0])
    expect(money.allocate(0, [1, 2])).toEqual([0, 0])
  })
})

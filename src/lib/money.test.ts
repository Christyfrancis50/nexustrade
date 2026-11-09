import { describe, expect, it } from 'vitest'
import { applyBasisPoints, formatMoney, fromMinor, toMinor } from './money'

describe('money', () => {
  it('round-trips decimal strings through minor units', () => {
    expect(toMinor('1234.5')).toBe(123450n)
    expect(toMinor('0.01')).toBe(1n)
    expect(toMinor('-7')).toBe(-700n)
    expect(fromMinor(123450n)).toBe('1234.50')
    expect(fromMinor(-5n)).toBe('-0.05')
  })

  it('rejects floats with too many decimals and junk', () => {
    expect(() => toMinor('1.005')).toThrow()
    expect(() => toMinor('abc')).toThrow()
    expect(() => toMinor('1e3')).toThrow()
  })

  it('avoids float drift (0.1 + 0.2)', () => {
    expect(fromMinor(toMinor('0.1') + toMinor('0.2'))).toBe('0.30')
  })

  it('computes 5% UAE VAT with half-up rounding', () => {
    expect(applyBasisPoints(toMinor('100.00'), 500n)).toBe(500n) // 5.00
    expect(applyBasisPoints(toMinor('0.10'), 500n)).toBe(1n) // 0.005 → 0.01
    expect(applyBasisPoints(toMinor('0.09'), 500n)).toBe(0n) // 0.0045 → 0.00
    expect(applyBasisPoints(toMinor('-0.10'), 500n)).toBe(-1n)
  })

  it('formats with grouping', () => {
    expect(formatMoney(toMinor('1234567.8'), 'AED')).toBe('AED 1,234,567.80')
  })
})

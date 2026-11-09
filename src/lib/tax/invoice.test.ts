import { describe, expect, it } from 'vitest'
import { fromMinor } from '../money'
import { computeInvoice, lineTotal } from './invoice'

const fmt = (t: ReturnType<typeof computeInvoice>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k === 'vatRateBp' ? Number(v) : fromMinor(v)]))

describe('lineTotal', () => {
  it('multiplies quantity by price exactly', () => {
    expect(fromMinor(lineTotal('3', '19.99'))).toBe('59.97')
    expect(fromMinor(lineTotal('2.5', '10.01'))).toBe('25.03') // 25.025 → 25.03
    expect(fromMinor(lineTotal('0.333', '3.00'))).toBe('1.00') // 0.999 → 1.00
  })

  it('rejects bad quantities', () => {
    expect(() => lineTotal('1.2345', '1')).toThrow()
    expect(() => lineTotal('-1', '1')).toThrow()
  })
})

describe('computeInvoice', () => {
  const lines = [
    { quantity: '10', unitPrice: '100.00', dutyRateBp: 500 }, // 1000.00, duty 50.00
    { quantity: '4', unitPrice: '25.00', dutyRateBp: 0 }, // 100.00, duty 0
  ]

  it('applies 5% VAT on value plus duty for standard-rated supplies (AED)', () => {
    expect(fmt(computeInvoice(lines, 'STANDARD', '1'))).toEqual({
      subtotal: '1100.00',
      duty: '50.00',
      vatRateBp: 500,
      vat: '57.50', // 5% of 1150.00
      total: '1207.50',
      totalAed: '1207.50',
    })
  })

  it('charges no VAT when zero-rated or exempt, but still charges duty', () => {
    for (const t of ['ZERO_RATED', 'EXEMPT'] as const) {
      const r = computeInvoice(lines, t, '1')
      expect(fromMinor(r.vat)).toBe('0.00')
      expect(fromMinor(r.total)).toBe('1150.00')
    }
  })

  it('converts the total to AED at the given rate', () => {
    const r = computeInvoice([{ quantity: '1', unitPrice: '100.00', dutyRateBp: 0 }], 'STANDARD', '3.6725')
    expect(fromMinor(r.total)).toBe('105.00')
    expect(fromMinor(r.totalAed)).toBe('385.61') // 105 × 3.6725 = 385.6125
  })

  it('needs at least one line', () => {
    expect(() => computeInvoice([], 'STANDARD', '1')).toThrow()
  })
})

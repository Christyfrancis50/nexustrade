import { describe, expect, it } from 'vitest'
import { parsePeriod } from './period'

describe('parsePeriod', () => {
  const now = new Date('2026-11-09T12:00:00Z')

  it('makes the end date inclusive', () => {
    const p = parsePeriod({ from: '2026-10-01', to: '2026-10-31' }, now)
    expect(p.from.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(p.toExclusive.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(p.label).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('defaults to the last 12 months and ignores junk', () => {
    const p = parsePeriod({ from: "2026-13-01'; drop table", to: null }, now)
    expect(p.label).toEqual({ from: '2025-11-09', to: '2026-11-09' })
  })

  it('rejects reversed and over-long ranges', () => {
    expect(() => parsePeriod({ from: '2026-10-02', to: '2026-10-01' }, now)).toThrow(/on or before/)
    expect(() => parsePeriod({ from: '2015-01-01', to: '2026-01-01' }, now)).toThrow(/5 years/)
  })
})

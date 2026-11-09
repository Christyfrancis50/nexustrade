import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../../../test/pglite'
import { aedRatesFromFrankfurter, divideRate, USD_AED_PEG } from './rates'
import { getRatesToAed } from './service'

const feed = { amount: 1, base: 'USD', date: '2026-11-06', rates: { EUR: 0.89566, GBP: 0.74711 } }
const okFetch = () => vi.fn(async () => new Response(JSON.stringify(feed), { status: 200 })) as unknown as typeof fetch
const downFetch = () => vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch

describe('divideRate', () => {
  it('divides exactly to 8 dp with half-up rounding', () => {
    expect(divideRate('3.6725', '1')).toBe('3.6725')
    expect(divideRate('1', '3')).toBe('0.33333333')
    expect(divideRate('2', '3')).toBe('0.66666667')
    expect(divideRate('3.6725', '0.89566')).toBe('4.10032825')
  })

  it('rejects junk and zero', () => {
    expect(() => divideRate('1', '0')).toThrow()
    expect(() => divideRate('1e3', '1')).toThrow()
  })
})

describe('aedRatesFromFrankfurter', () => {
  it('crosses ECB USD rates through the AED peg', () => {
    const r = aedRatesFromFrankfurter(feed)
    expect(r.rates).toEqual({ AED: '1', USD: USD_AED_PEG, EUR: '4.10032825', GBP: '4.91560814' })
    expect(r.asOf.toISOString()).toBe('2026-11-06T00:00:00.000Z')
  })

  it('rejects unexpected payloads', () => {
    expect(() => aedRatesFromFrankfurter({ base: 'EUR', date: '2026-11-06', rates: {} })).toThrow()
    expect(() => aedRatesFromFrankfurter({ ...feed, rates: { EUR: -1, GBP: 1 } })).toThrow()
  })
})

describe('getRatesToAed', () => {
  let t: TestDb
  beforeAll(async () => {
    t = await createTestDb()
  }, 60_000)

  it('uses indicative fallback rates when the feed is down and nothing is cached', async () => {
    const r = await getRatesToAed(t.db, { fetcher: downFetch() })
    expect(r.source).toBe('fallback')
    expect(r.rates.USD).toBe(USD_AED_PEG)
  })

  it('fetches from the feed and stores the rates', async () => {
    const f = okFetch()
    const r = await getRatesToAed(t.db, { fetcher: f, now: new Date('2026-11-06T10:00:00Z') })
    expect(r.source).toBe('feed')
    expect(r.rates.EUR).toBe('4.10032825')
    expect(f).toHaveBeenCalledOnce()
  })

  it('serves fresh rates from the cache without calling the feed', async () => {
    const f = okFetch()
    const r = await getRatesToAed(t.db, { fetcher: f, now: new Date('2026-11-06T12:00:00Z') })
    expect(r.source).toBe('cache')
    expect(r.rates.EUR).toBe('4.10032825')
    expect(f).not.toHaveBeenCalled()
  })

  it('falls back to the last known rates when the cache is stale and the feed is down', async () => {
    const r = await getRatesToAed(t.db, { fetcher: downFetch(), now: new Date('2026-11-09T12:00:00Z') })
    expect(r.source).toBe('stale-cache')
    expect(r.rates.GBP).toBe('4.91560814')
  })
})

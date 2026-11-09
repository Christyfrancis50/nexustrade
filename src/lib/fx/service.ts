import { desc, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '../../db/schema'
import { CURRENCIES, type Currency } from '../money'
import { normaliseRate } from '../ledger/post'
import { aedRatesFromFrankfurter, FALLBACK_RATES, FRANKFURTER_URL } from './rates'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type RateSnapshot = {
  rates: Record<Currency, string>
  asOf: Date
  source: 'feed' | 'cache' | 'stale-cache' | 'fallback'
}

export type FxOptions = {
  now?: Date
  /** Refresh from the feed when the cached rate is older than this. Default 12 h. */
  maxAgeMs?: number
  fetcher?: typeof fetch
}

/**
 * AED rates for every supported currency, cheapest source first:
 *  1. fresh rows in `fx_rates` (cache)
 *  2. the free ECB feed (Frankfurter), saved to `fx_rates`
 *  3. the newest stored rows, however old (flagged stale-cache)
 *  4. indicative constants, so the app never hard-fails (flagged fallback)
 * Every posting stores the rate it used, so later changes never alter history.
 */
export async function getRatesToAed(db: Db, opts: FxOptions = {}): Promise<RateSnapshot> {
  const now = opts.now ?? new Date()
  const maxAge = opts.maxAgeMs ?? 12 * 60 * 60 * 1000

  const latest = async () => {
    const out: Partial<Record<Currency, { rate: string; asOf: Date; fetchedAt: Date }>> = {}
    for (const c of CURRENCIES) {
      const [row] = await db.select().from(schema.fxRates).where(eq(schema.fxRates.currency, c)).orderBy(desc(schema.fxRates.asOf)).limit(1)
      if (row) out[c] = { rate: normaliseRate(row.rateToAed), asOf: row.asOf, fetchedAt: row.fetchedAt }
    }
    return out
  }

  const cached = await latest()
  const complete = CURRENCIES.every((c) => cached[c])
  const fresh = complete && CURRENCIES.every((c) => now.getTime() - cached[c]!.fetchedAt.getTime() < maxAge)
  const snapshot = (source: RateSnapshot['source']): RateSnapshot => ({
    source,
    rates: Object.fromEntries(CURRENCIES.map((c) => [c, cached[c]!.rate])) as Record<Currency, string>,
    asOf: new Date(Math.min(...CURRENCIES.map((c) => cached[c]!.asOf.getTime()))),
  })
  if (fresh) return snapshot('cache')

  try {
    const res = await (opts.fetcher ?? fetch)(FRANKFURTER_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`FX feed returned ${res.status}`)
    const { asOf, rates } = aedRatesFromFrankfurter(await res.json())
    for (const c of CURRENCIES)
      await db
        .insert(schema.fxRates)
        .values({ currency: c, rateToAed: rates[c], source: 'frankfurter (ECB) via USD peg', asOf, fetchedAt: now })
        .onConflictDoUpdate({ target: [schema.fxRates.currency, schema.fxRates.asOf], set: { fetchedAt: now } })
    return { rates, asOf, source: 'feed' }
  } catch {
    if (complete) return snapshot('stale-cache')
    return { rates: { ...FALLBACK_RATES }, asOf: now, source: 'fallback' }
  }
}

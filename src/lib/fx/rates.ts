import { z } from 'zod'
import type { Currency } from '../money'

/** The UAE dirham is pegged to the US dollar by the Central Bank of the UAE. */
export const USD_AED_PEG = '3.6725'

/** Indicative last-resort rates, used only if the feed has never been reachable. */
export const FALLBACK_RATES: Record<Currency, string> = { AED: '1', USD: USD_AED_PEG, EUR: '4.015', GBP: '4.73' }

export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP'

const DECIMAL = /^(\d+)(?:\.(\d+))?$/

function parseDecimal(s: string): { int: bigint; scale: number } {
  const m = DECIMAL.exec(s)
  if (!m) throw new Error(`Invalid decimal: "${s}"`)
  const frac = m[2] ?? ''
  return { int: BigInt(m[1]! + frac), scale: frac.length }
}

/** a ÷ b to 8 decimal places, half-up, in exact integer arithmetic. */
export function divideRate(a: string, b: string): string {
  const x = parseDecimal(a)
  const y = parseDecimal(b)
  if (y.int === 0n) throw new Error('Division by zero')
  const num = x.int * 10n ** BigInt(y.scale + 8)
  const den = y.int * 10n ** BigInt(x.scale)
  let q = num / den
  if ((num % den) * 2n >= den) q += 1n
  const s = q.toString().padStart(9, '0')
  return `${s.slice(0, -8)}.${s.slice(-8)}`.replace(/0+$/, '').replace(/\.$/, '')
}

const frankfurterSchema = z.object({
  base: z.literal('USD'),
  date: z.iso.date(),
  rates: z.object({ EUR: z.number().positive(), GBP: z.number().positive() }),
})

/**
 * The ECB feed has no AED, so cross through the USD peg:
 * AED per EUR = (AED per USD) ÷ (EUR per USD).
 */
export function aedRatesFromFrankfurter(json: unknown): { asOf: Date; rates: Record<Currency, string> } {
  const data = frankfurterSchema.parse(json)
  const per = (n: number) => {
    const s = String(n)
    if (!DECIMAL.test(s)) throw new Error(`Unexpected rate format: ${s}`)
    return divideRate(USD_AED_PEG, s)
  }
  return {
    asOf: new Date(`${data.date}T00:00:00Z`),
    rates: { AED: '1', USD: USD_AED_PEG, EUR: per(data.rates.EUR), GBP: per(data.rates.GBP) },
  }
}

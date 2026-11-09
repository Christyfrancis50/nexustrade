/**
 * Money is handled as integer minor units (fils/cents) held in `bigint`.
 * Never use JS floats for amounts. Postgres stores `numeric(14,2)` strings;
 * convert at the boundary with `toMinor` / `fromMinor`.
 */
export type Currency = 'AED' | 'USD' | 'EUR' | 'GBP'
export const CURRENCIES: readonly Currency[] = ['AED', 'USD', 'EUR', 'GBP']

const DECIMAL = /^(-)?(\d+)(?:\.(\d{1,2}))?$/

/** "1234.5" → 123450n. Rejects anything with more than 2 decimals or non-numeric input. */
export function toMinor(amount: string): bigint {
  const m = DECIMAL.exec(amount.trim())
  if (!m) throw new Error(`Invalid money amount: "${amount}"`)
  const [, sign, whole, frac = ''] = m
  const minor = BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'))
  return sign ? -minor : minor
}

/** 123450n → "1234.50" */
export function fromMinor(minor: bigint): string {
  const neg = minor < 0n
  const abs = neg ? -minor : minor
  const whole = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

/**
 * Multiply minor units by a decimal rate given in basis points (1 bp = 0.01%),
 * rounding half away from zero. 5% VAT = 500 bp.
 */
export function applyBasisPoints(minor: bigint, bp: bigint): bigint {
  const product = minor * bp
  const q = product / 10_000n
  const r = product % 10_000n
  const absR = r < 0n ? -r : r
  if (absR * 2n >= 10_000n) return product < 0n ? q - 1n : q + 1n
  return q
}

export function formatMoney(minor: bigint, currency: Currency): string {
  const [whole, frac] = fromMinor(minor).split('.')
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${currency} ${grouped}.${frac}`
}

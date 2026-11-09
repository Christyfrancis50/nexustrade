import { convert, type Currency } from '../money'

/** Chart of accounts used by the posting rules (seeded in the `accounts` table). */
export const ACCOUNT = {
  CASH: '1000',
  RECEIVABLE: '1100',
  ESCROW: '2100',
  CARRIER_PAYABLE: '2200',
  VAT_PAYABLE: '2300',
  DUTY_PAYABLE: '2400',
  GOODS_REVENUE: '4000',
  FEE_REVENUE: '4100',
} as const
export type AccountCode = (typeof ACCOUNT)[keyof typeof ACCOUNT]

export type Direction = 'DEBIT' | 'CREDIT'

export type DraftEntry = {
  account: AccountCode
  direction: Direction
  amount: bigint // minor units in `currency`
  currency: Currency
  fxRateToAed: string
}

export type PostedEntry = DraftEntry & { amountAed: bigint }

export class LedgerError extends Error {
  override name = 'LedgerError'
}

const debit = (account: AccountCode, amount: bigint, currency: Currency, fxRateToAed: string): DraftEntry => ({
  account,
  direction: 'DEBIT',
  amount,
  currency,
  fxRateToAed,
})
const credit = (account: AccountCode, amount: bigint, currency: Currency, fxRateToAed: string): DraftEntry => ({
  account,
  direction: 'CREDIT',
  amount,
  currency,
  fxRateToAed,
})

/**
 * Validate a draft and add AED amounts.
 *  - every amount is positive; AED lines use rate 1
 *  - at least one debit and one credit
 *  - balanced in each original currency
 * Converting each line to AED separately can leave a rounding difference of a
 * few fils. That difference goes on the largest line of the lighter side, so the
 * AED totals balance exactly (the DB trigger checks the same rule).
 */
export function withAed(entries: DraftEntry[]): PostedEntry[] {
  if (!entries.some((e) => e.direction === 'DEBIT') || !entries.some((e) => e.direction === 'CREDIT'))
    throw new LedgerError('A transaction needs at least one debit and one credit')

  const perCurrency = new Map<Currency, bigint>()
  for (const e of entries) {
    if (e.amount <= 0n) throw new LedgerError(`Amounts must be positive (got ${e.amount} on ${e.account})`)
    if (e.currency === 'AED' && e.fxRateToAed !== '1') throw new LedgerError('AED entries must use an FX rate of 1')
    const signed = e.direction === 'DEBIT' ? e.amount : -e.amount
    perCurrency.set(e.currency, (perCurrency.get(e.currency) ?? 0n) + signed)
  }
  for (const [cur, net] of perCurrency)
    if (net !== 0n) throw new LedgerError(`Unbalanced in ${cur}: debits − credits = ${net} minor units`)

  const posted = entries.map((e) => ({ ...e, amountAed: convert(e.amount, e.fxRateToAed) }))
  const sum = (d: Direction) => posted.filter((e) => e.direction === d).reduce((s, e) => s + e.amountAed, 0n)
  const diff = sum('DEBIT') - sum('CREDIT')
  if (diff !== 0n) {
    const absDiff = diff < 0n ? -diff : diff
    if (absDiff > BigInt(posted.length)) throw new LedgerError(`AED rounding difference too large: ${diff}`)
    const lighter: Direction = diff > 0n ? 'CREDIT' : 'DEBIT'
    const target = posted
      .filter((e) => e.direction === lighter)
      .reduce((a, b) => (b.amountAed > a.amountAed ? b : a))
    target.amountAed += absDiff
  }
  return posted
}

// ---------------------------------------------------------------------------
// Posting rules for each business event. Each returns a balanced draft.
// ---------------------------------------------------------------------------

type Money = { amount: bigint; currency: Currency; fxRateToAed: string }

/** Importer pays the full freight into escrow at booking (Stripe test payment). */
export function escrowFunded({ amount, currency, fxRateToAed }: Money): DraftEntry[] {
  return [debit(ACCOUNT.CASH, amount, currency, fxRateToAed), credit(ACCOUNT.ESCROW, amount, currency, fxRateToAed)]
}

/** A milestone releases part of the escrow to the carrier, who is now owed it. */
export function milestoneReleased({ amount, currency, fxRateToAed }: Money): DraftEntry[] {
  return [debit(ACCOUNT.ESCROW, amount, currency, fxRateToAed), credit(ACCOUNT.CARRIER_PAYABLE, amount, currency, fxRateToAed)]
}

/** The carrier is paid out (simulated transfer). */
export function carrierPaid({ amount, currency, fxRateToAed }: Money): DraftEntry[] {
  return [debit(ACCOUNT.CARRIER_PAYABLE, amount, currency, fxRateToAed), credit(ACCOUNT.CASH, amount, currency, fxRateToAed)]
}

/**
 * Invoice issued to the consignee: the receivable covers goods value, customs
 * duty (collected for the authority) and VAT (owed to the FTA).
 */
export function invoiceIssued(
  t: { subtotal: bigint; duty: bigint; vat: bigint; total: bigint },
  currency: Currency,
  fxRateToAed: string,
): DraftEntry[] {
  if (t.subtotal + t.duty + t.vat !== t.total) throw new LedgerError('Invoice parts do not add up to the total')
  const lines = [
    debit(ACCOUNT.RECEIVABLE, t.total, currency, fxRateToAed),
    credit(ACCOUNT.GOODS_REVENUE, t.subtotal, currency, fxRateToAed),
  ]
  if (t.duty > 0n) lines.push(credit(ACCOUNT.DUTY_PAYABLE, t.duty, currency, fxRateToAed))
  if (t.vat > 0n) lines.push(credit(ACCOUNT.VAT_PAYABLE, t.vat, currency, fxRateToAed))
  return lines
}

/** The exact opposite of a posted transaction, used to correct mistakes. */
export function reversalOf(entries: Array<DraftEntry | PostedEntry>): DraftEntry[] {
  return entries.map((e) => ({
    account: e.account,
    direction: e.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amount: e.amount,
    currency: e.currency,
    fxRateToAed: e.fxRateToAed,
  }))
}

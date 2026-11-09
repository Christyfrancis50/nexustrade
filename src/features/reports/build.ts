import { applyBasisPoints, convert, fromMinor, toMinor } from '@/lib/money'
import { toCsv } from '@/lib/csv'

// ---------------------------------------------------------------------------
// Inputs (plain rows, so these builders are pure and unit-testable)
// ---------------------------------------------------------------------------

export type JournalLine = {
  transactionId: string
  postedAt: Date
  description: string
  reference: string // idempotency key: stable, unique per transaction
  accountCode: string
  accountName: string
  direction: 'DEBIT' | 'CREDIT'
  amountAed: string
}

export type InvoiceRow = {
  invoiceNumber: string
  issuedAt: Date
  trackingNumber: string
  consigneeName: string
  consigneeTrn: string | null
  taxTreatment: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'
  currency: string
  fxRateToAed: string
  subtotal: string
  dutyAmount: string
  vatAmount: string
  total: string
  totalAed: string
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/** Group lines by transaction and check every journal balances before exporting. */
export function assertJournalsBalance(lines: JournalLine[]): void {
  const net = new Map<string, bigint>()
  for (const l of lines) net.set(l.transactionId, (net.get(l.transactionId) ?? 0n) + (l.direction === 'DEBIT' ? 1n : -1n) * toMinor(l.amountAed))
  for (const [id, n] of net) if (n !== 0n) throw new Error(`Journal ${id} does not balance (off by ${fromMinor(n)} AED)`)
}

const ordered = (lines: JournalLine[]) =>
  [...lines].sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime() || a.reference.localeCompare(b.reference) || (a.direction === b.direction ? 0 : a.direction === 'DEBIT' ? -1 : 1))

/** Generic double-entry journal (Debit/Credit columns). Zoho Books maps these columns on import. */
export function journalCsv(lines: JournalLine[]): string {
  assertJournalsBalance(lines)
  return toCsv(ordered(lines), [
    { header: 'Journal Date', value: (l) => isoDate(l.postedAt) },
    { header: 'Reference Number', value: (l) => l.reference },
    { header: 'Notes', value: (l) => l.description },
    { header: 'Currency', value: () => 'AED' },
    { header: 'Account Code', value: (l) => l.accountCode },
    { header: 'Account', value: (l) => l.accountName },
    { header: 'Debit', value: (l) => (l.direction === 'DEBIT' ? l.amountAed : '') },
    { header: 'Credit', value: (l) => (l.direction === 'CREDIT' ? l.amountAed : '') },
  ])
}

/**
 * Xero-style manual journal: one signed Amount column (debit +, credit −).
 * Headers follow the commonly used manual-journal template; check them against
 * the template from your Xero import screen. Note that Xero blocks receivable,
 * payable and bank accounts in manual journals, so map those accounts to
 * clearing accounts on the Xero side.
 */
export function xeroJournalCsv(lines: JournalLine[], taxRate = 'No VAT'): string {
  assertJournalsBalance(lines)
  return toCsv(ordered(lines), [
    { header: '*Narration', value: (l) => `${l.description} [${l.reference}]` },
    { header: '*Date', value: (l) => isoDate(l.postedAt) },
    { header: 'Description', value: (l) => l.accountName },
    { header: '*AccountCode', value: (l) => l.accountCode },
    { header: '*TaxRate', value: () => taxRate },
    { header: '*Amount', value: (l) => (l.direction === 'DEBIT' ? l.amountAed : `-${l.amountAed}`) },
  ])
}

// ---------------------------------------------------------------------------
// VAT audit report
// ---------------------------------------------------------------------------

export type VatSummary = {
  period: { from: string; to: string }
  standardRated: { taxableAed: bigint; vatAed: bigint; count: number }
  zeroRated: { valueAed: bigint; count: number }
  exempt: { valueAed: bigint; count: number }
  issues: string[]
}

/** Convert an amount in the invoice currency to AED using the invoice's stored rate. */
const aedOf = (minor: bigint, rate: string) => convert(minor, rate)

/**
 * Summary in the spirit of the UAE VAT return (standard-rated supplies and output
 * tax, zero-rated, exempt), plus checks an auditor would ask about.
 */
export function vatSummary(invoices: InvoiceRow[], from: Date, to: Date): VatSummary {
  const s: VatSummary = {
    period: { from: isoDate(from), to: isoDate(to) },
    standardRated: { taxableAed: 0n, vatAed: 0n, count: 0 },
    zeroRated: { valueAed: 0n, count: 0 },
    exempt: { valueAed: 0n, count: 0 },
    issues: [],
  }
  for (const inv of invoices) {
    const base = toMinor(inv.subtotal) + toMinor(inv.dutyAmount) // VAT base: value + duty
    const vat = toMinor(inv.vatAmount)
    if (inv.taxTreatment === 'STANDARD') {
      s.standardRated.taxableAed += aedOf(base, inv.fxRateToAed)
      s.standardRated.vatAed += aedOf(vat, inv.fxRateToAed)
      s.standardRated.count++
      const expected = applyBasisPoints(base, 500n)
      if (vat - expected > 1n || expected - vat > 1n)
        s.issues.push(`${inv.invoiceNumber}: VAT ${inv.vatAmount} is not 5% of ${fromMinor(base)} (expected ${fromMinor(expected)})`)
      if (!inv.consigneeTrn) s.issues.push(`${inv.invoiceNumber}: standard-rated invoice without a customer TRN`)
    } else {
      if (vat !== 0n) s.issues.push(`${inv.invoiceNumber}: ${inv.taxTreatment.toLowerCase().replace('_', '-')} invoice charges VAT`)
      const bucket = inv.taxTreatment === 'ZERO_RATED' ? s.zeroRated : s.exempt
      bucket.valueAed += aedOf(base, inv.fxRateToAed)
      bucket.count++
    }
  }
  return s
}

export function vatCsv(invoices: InvoiceRow[]): string {
  return toCsv(
    [...invoices].sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime()),
    [
      { header: 'Invoice Number', value: (i) => i.invoiceNumber },
      { header: 'Issue Date', value: (i) => isoDate(i.issuedAt) },
      { header: 'Shipment', value: (i) => i.trackingNumber },
      { header: 'Customer', value: (i) => i.consigneeName },
      { header: 'Customer TRN', value: (i) => i.consigneeTrn ?? '' },
      { header: 'Tax Treatment', value: (i) => i.taxTreatment },
      { header: 'Currency', value: (i) => i.currency },
      { header: 'FX Rate to AED', value: (i) => i.fxRateToAed },
      { header: 'Subtotal', value: (i) => i.subtotal },
      { header: 'Customs Duty', value: (i) => i.dutyAmount },
      { header: 'VAT', value: (i) => i.vatAmount },
      { header: 'Total', value: (i) => i.total },
      { header: 'Total (AED)', value: (i) => i.totalAed },
    ],
  )
}

// ---------------------------------------------------------------------------
// Dashboard aggregations
// ---------------------------------------------------------------------------

export type SpendPoint = { month: string; aed: number }

/** Freight spend per calendar month in AED (funded shipments), oldest first, gaps filled. */
export function monthlySpend(rows: Array<{ at: Date; amountAed: string }>, months = 6, now = new Date()): SpendPoint[] {
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const buckets = new Map<string, bigint>()
  for (let i = months - 1; i >= 0; i--) buckets.set(key(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))), 0n)
  for (const r of rows) {
    const k = key(r.at)
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + toMinor(r.amountAed))
  }
  return [...buckets].map(([month, minor]) => ({ month, aed: Number(minor) / 100 }))
}

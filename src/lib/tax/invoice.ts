import { applyBasisPoints, convert, toMinor } from '../money'

export type TaxTreatment = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'

/** UAE VAT rates by treatment, in basis points. */
export const VAT_RATE_BP: Record<TaxTreatment, bigint> = {
  STANDARD: 500n, // 5% standard rate
  ZERO_RATED: 0n, // e.g. exports outside the GCC
  EXEMPT: 0n, // e.g. supplies within designated free zones
}

export type InvoiceLine = { quantity: string; unitPrice: string; dutyRateBp: number }

export type InvoiceTotals = {
  subtotal: bigint
  duty: bigint
  vatRateBp: bigint
  vat: bigint
  total: bigint
  totalAed: bigint
}

const QTY = /^(\d+)(?:\.(\d{1,3}))?$/

/** quantity (up to 3 dp) × unit price, in minor units, rounded half-up. */
export function lineTotal(quantity: string, unitPrice: string): bigint {
  const m = QTY.exec(quantity.trim())
  if (!m) throw new Error(`Invalid quantity: "${quantity}"`)
  const milli = BigInt(m[1]!) * 1000n + BigInt((m[2] ?? '').padEnd(3, '0'))
  const product = milli * toMinor(unitPrice)
  const q = product / 1000n
  return product % 1000n >= 500n ? q + 1n : q
}

/**
 * Invoice totals. Customs duty is computed per line on its value. UAE import VAT
 * is charged on the value plus duty (simplified model: no excise, insurance or
 * freight uplift). All arithmetic is in integer minor units.
 */
export function computeInvoice(lines: InvoiceLine[], treatment: TaxTreatment, fxRateToAed: string): InvoiceTotals {
  if (lines.length === 0) throw new Error('An invoice needs at least one line')
  let subtotal = 0n
  let duty = 0n
  for (const line of lines) {
    const value = lineTotal(line.quantity, line.unitPrice)
    subtotal += value
    duty += applyBasisPoints(value, BigInt(line.dutyRateBp))
  }
  const vatRateBp = VAT_RATE_BP[treatment]
  const vat = applyBasisPoints(subtotal + duty, vatRateBp)
  const total = subtotal + duty + vat
  return { subtotal, duty, vatRateBp, vat, total, totalAed: convert(total, fxRateToAed) }
}
